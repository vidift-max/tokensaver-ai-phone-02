#include "RealSupervisorTeamRoomHttpsAdapter.h"

#include <winhttp.h>
#include <rpc.h>
#include <algorithm>
#include <string>
#include <vector>

#pragma comment(lib, "winhttp.lib")
#pragma comment(lib, "Rpcrt4.lib")

namespace phone_supervisor {
namespace {

constexpr wchar_t kHost[] = L"team-room.p238.test";
constexpr INTERNET_PORT kPort = 8443;
constexpr wchar_t kHealthPath[] = L"/health/live";
constexpr DWORD kTimeoutMs = 5000;
constexpr size_t kMaxResponseBytes = 65536;

class Handle final {
public:
    explicit Handle(HINTERNET handle = nullptr) : handle_(handle) {}
    ~Handle() {
        if (handle_) {
            WinHttpCloseHandle(handle_);
        }
    }
    Handle(const Handle&) = delete;
    Handle& operator=(const Handle&) = delete;
    HINTERNET get() const { return handle_; }
private:
    HINTERNET handle_;
};

bool SameHost(const std::wstring& host) {
    return CompareStringOrdinal(
               host.c_str(), static_cast<int>(host.size()), kHost, -1, TRUE) == CSTR_EQUAL;
}

bool ParseUuid(const std::string& value) {
    UUID uuid{};
    RPC_CSTR raw = reinterpret_cast<RPC_CSTR>(
        const_cast<char*>(value.c_str()));
    return UuidFromStringA(raw, &uuid) == RPC_S_OK;
}

std::string UuidString() {
    UUID uuid{};
    if (UuidCreate(&uuid) != RPC_S_OK) {
        return {};
    }
    RPC_CSTR raw = nullptr;
    if (UuidToStringA(&uuid, &raw) != RPC_S_OK || !raw) {
        return {};
    }
    std::string result(reinterpret_cast<char*>(raw));
    RpcStringFreeA(&raw);
    return result;
}

bool ExtractJsonString(const std::string& json, const std::string& key, std::string& out) {
    const std::string needle = "\"" + key + "\"";
    size_t pos = json.find(needle);
    while (pos != std::string::npos) {
        pos = json.find(':', pos + needle.size());
        if (pos == std::string::npos) {
            return false;
        }
        ++pos;
        while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t' ||
                                     json[pos] == '\r' || json[pos] == '\n')) {
            ++pos;
        }
        if (pos >= json.size() || json[pos] != '"') {
            return false;
        }
        ++pos;
        std::string value;
        value.reserve(64);
        bool escaped = false;
        for (; pos < json.size(); ++pos) {
            char ch = json[pos];
            if (escaped) {
                switch (ch) {
                case '"': value.push_back('"'); break;
                case '\\': value.push_back('\\'); break;
                case '/': value.push_back('/'); break;
                case 'b': value.push_back('\b'); break;
                case 'f': value.push_back('\f'); break;
                case 'n': value.push_back('\n'); break;
                case 'r': value.push_back('\r'); break;
                case 't': value.push_back('\t'); break;
                default: return false;
                }
                escaped = false;
                continue;
            }
            if (ch == '\\') {
                escaped = true;
                continue;
            }
            if (ch == '"') {
                out = value;
                return true;
            }
            if (static_cast<unsigned char>(ch) < 0x20) {
                return false;
            }
            value.push_back(ch);
            if (value.size() > 16384) {
                return false;
            }
        }
        return false;
    }
    return false;
}

} // namespace

std::wstring RealSupervisorTeamRoomHttpsAdapter::Error(const wchar_t* operation, DWORD code) {
    return std::wstring(operation) + L" failed; WINHTTP_ERROR=" + std::to_wstring(code);
}

bool RealSupervisorTeamRoomHttpsAdapter::ValidateEndpoint(
    const std::wstring& url, std::wstring& reason) {
    reason.clear();
    if (url.empty() || url.size() > 2048) {
        reason = L"ENDPOINT_EMPTY_OR_TOO_LONG";
        return false;
    }

    URL_COMPONENTS components{};
    components.dwStructSize = sizeof(components);
    components.dwSchemeLength = components.dwHostNameLength =
        components.dwUserNameLength = components.dwPasswordLength =
            components.dwUrlPathLength = components.dwExtraInfoLength =
                static_cast<DWORD>(-1);

    if (!WinHttpCrackUrl(url.c_str(), static_cast<DWORD>(url.size()), 0, &components)) {
        reason = Error(L"WinHttpCrackUrl", GetLastError());
        return false;
    }

    if (components.nScheme != INTERNET_SCHEME_HTTPS) {
        reason = L"HTTPS_REQUIRED_HTTP_REJECTED";
        return false;
    }
    if ((components.lpszUserName && components.dwUserNameLength) ||
        (components.lpszPassword && components.dwPasswordLength)) {
        reason = L"ENDPOINT_USERINFO_FORBIDDEN";
        return false;
    }

    std::wstring host(components.lpszHostName, components.dwHostNameLength);
    if (!SameHost(host)) {
        reason = L"ENDPOINT_HOST_NOT_ALLOWLISTED";
        return false;
    }
    if (components.nPort != kPort) {
        reason = L"ENDPOINT_PORT_NOT_ALLOWLISTED";
        return false;
    }

    std::wstring path = components.lpszUrlPath
        ? std::wstring(components.lpszUrlPath, components.dwUrlPathLength)
        : L"/";
    if (path != kHealthPath) {
        reason = L"ENDPOINT_PATH_NOT_ALLOWLISTED";
        return false;
    }
    if (components.lpszExtraInfo && components.dwExtraInfoLength) {
        reason = L"ENDPOINT_QUERY_OR_FRAGMENT_FORBIDDEN";
        return false;
    }
    return true;
}

void RealSupervisorTeamRoomHttpsAdapter::Configure(
    const std::wstring& endpoint, const std::string& room_id) {
    endpoint_ = endpoint;
    roomId_ = room_id;
}

void RealSupervisorTeamRoomHttpsAdapter::Clear() {
    if (!teamRoomToken_.empty()) {
        SecureZeroMemory(teamRoomToken_.data(), teamRoomToken_.size());
    }
    teamRoomToken_.clear();
    if (!endpointCredential_.empty()) {
        SecureZeroMemory(endpointCredential_.data(), endpointCredential_.size());
    }
    endpointCredential_.clear();
    roomId_.clear();
    endpoint_.clear();
    attachment_ = {};
}

bool RealSupervisorTeamRoomHttpsAdapter::ProbeHealth(
    const std::wstring& url, DWORD& status, std::wstring& reason) const {
    status = 0;
    if (!ValidateEndpoint(url, reason)) {
        return false;
    }

    URL_COMPONENTS components{};
    components.dwStructSize = sizeof(components);
    components.dwSchemeLength = components.dwHostNameLength =
        components.dwUrlPathLength = static_cast<DWORD>(-1);
    if (!WinHttpCrackUrl(url.c_str(), static_cast<DWORD>(url.size()), 0, &components)) {
        reason = Error(L"WinHttpCrackUrl", GetLastError());
        return false;
    }

    std::wstring host(components.lpszHostName, components.dwHostNameLength);
    std::wstring path(components.lpszUrlPath, components.dwUrlPathLength);

    Handle session(WinHttpOpen(
        L"TokenSaver-Phone02-Supervisor/P2.38-A",
        WINHTTP_ACCESS_TYPE_NO_PROXY,
        WINHTTP_NO_PROXY_NAME,
        WINHTTP_NO_PROXY_BYPASS,
        0));
    if (!session.get()) {
        reason = Error(L"WinHttpOpen", GetLastError());
        return false;
    }

    DWORD protocols = WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_2;
    if (!WinHttpSetOption(
            session.get(), WINHTTP_OPTION_SECURE_PROTOCOLS,
            &protocols, sizeof(protocols))) {
        reason = Error(L"SECURE_PROTOCOLS", GetLastError());
        return false;
    }
    WinHttpSetTimeouts(session.get(), kTimeoutMs, kTimeoutMs, kTimeoutMs, kTimeoutMs);

    Handle connection(WinHttpConnect(session.get(), host.c_str(), components.nPort, 0));
    if (!connection.get()) {
        reason = Error(L"WinHttpConnect", GetLastError());
        return false;
    }

    Handle request(WinHttpOpenRequest(
        connection.get(), L"GET", path.c_str(), nullptr,
        WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, WINHTTP_FLAG_SECURE));
    if (!request.get()) {
        reason = Error(L"WinHttpOpenRequest", GetLastError());
        return false;
    }

    DWORD redirect = WINHTTP_OPTION_REDIRECT_POLICY_NEVER;
    if (!WinHttpSetOption(
            request.get(), WINHTTP_OPTION_REDIRECT_POLICY,
            &redirect, sizeof(redirect))) {
        reason = Error(L"REDIRECT_POLICY", GetLastError());
        return false;
    }

    if (!WinHttpSendRequest(
            request.get(), WINHTTP_NO_ADDITIONAL_HEADERS, 0,
            WINHTTP_NO_REQUEST_DATA, 0, 0, 0) ||
        !WinHttpReceiveResponse(request.get(), nullptr)) {
        reason = Error(L"HTTPS_SEND_OR_RECEIVE", GetLastError());
        return false;
    }

    DWORD bytes = sizeof(status);
    if (!WinHttpQueryHeaders(
            request.get(),
            WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
            WINHTTP_HEADER_NAME_BY_INDEX, &status, &bytes,
            WINHTTP_NO_HEADER_INDEX)) {
        reason = Error(L"HTTP_STATUS", GetLastError());
        return false;
    }

    std::string body;
    for (;;) {
        DWORD available = 0;
        if (!WinHttpQueryDataAvailable(request.get(), &available)) {
            reason = Error(L"QUERY_DATA", GetLastError());
            return false;
        }
        if (!available) {
            break;
        }
        if (available > 4096 || body.size() + available > 4096) {
            reason = L"HEALTH_RESPONSE_TOO_LARGE";
            return false;
        }
        const size_t old = body.size();
        body.resize(old + available);
        DWORD got = 0;
        if (!WinHttpReadData(request.get(), body.data() + old, available, &got)) {
            reason = Error(L"READ_DATA", GetLastError());
            return false;
        }
        body.resize(old + got);
        if (!got) {
            break;
        }
    }

    if (status != 200) {
        reason = L"TEAM_ROOM_HEALTH_HTTP_STATUS_" + std::to_wstring(status);
        return false;
    }
    if (body.find("\"service\":\"ai-team-room\"") == std::string::npos ||
        body.find("\"status\":\"live\"") == std::string::npos) {
        reason = L"TEAM_ROOM_HEALTH_BODY_UNEXPECTED";
        return false;
    }

    reason = L"OK";
    return true;
}

bool RealSupervisorTeamRoomHttpsAdapter::request(
    const wchar_t* method,
    const std::wstring& path,
    const std::string& body,
    std::string& response,
    const std::string* endpointCredential,
    DWORD& status,
    std::wstring& reason) const {
    response.clear();
    status = 0;

    if (endpoint_.empty() || roomId_.empty()) {
        reason = L"TEAM_ROOM_ENDPOINT_OR_ROOM_NOT_CONFIGURED";
        return false;
    }
    if (!ParseUuid(roomId_)) {
        reason = L"TEAM_ROOM_ROOM_ID_INVALID_UUID";
        return false;
    }

    // The configured endpoint is pinned to the approved HTTPS host/port.
    // Individual API paths are selected by the adapter and are never accepted
    // from untrusted input.
    URL_COMPONENTS components{};
    {
        URL_COMPONENTS base{};
        base.dwStructSize = sizeof(base);
        base.dwSchemeLength = base.dwHostNameLength =
            base.dwUserNameLength = base.dwPasswordLength =
            base.dwUrlPathLength = base.dwExtraInfoLength = static_cast<DWORD>(-1);
        if (!WinHttpCrackUrl(endpoint_.c_str(), static_cast<DWORD>(endpoint_.size()), 0, &base) ||
            base.nScheme != INTERNET_SCHEME_HTTPS ||
            base.nPort != kPort ||
            (base.lpszUserName && base.dwUserNameLength) ||
            (base.lpszPassword && base.dwPasswordLength)) {
            reason = L"TEAM_ROOM_BASE_ENDPOINT_NOT_ALLOWED";
            return false;
        }
        std::wstring host(base.lpszHostName, base.dwHostNameLength);
        if (!SameHost(host)) {
            reason = L"TEAM_ROOM_BASE_HOST_NOT_ALLOWLISTED";
            return false;
        }
        if ((base.lpszExtraInfo && base.dwExtraInfoLength) ||
            (base.lpszUrlPath && base.dwUrlPathLength &&
             std::wstring(base.lpszUrlPath, base.dwUrlPathLength) != L"/health/live")) {
            // The configured URL may be the health URL only; API routes are appended below.
            if (base.lpszExtraInfo && base.dwExtraInfoLength) {
                reason = L"TEAM_ROOM_BASE_QUERY_OR_FRAGMENT_FORBIDDEN";
                return false;
            }
        }
    }

    if (!WinHttpCrackUrl(endpoint_.c_str(), static_cast<DWORD>(endpoint_.size()), 0, &components)) {
        reason = Error(L"WinHttpCrackUrl", GetLastError());
        return false;
    }
    std::wstring host(components.lpszHostName, components.dwHostNameLength);
    components.dwStructSize = sizeof(components);
    components.dwSchemeLength = components.dwHostNameLength =
        components.dwUrlPathLength = static_cast<DWORD>(-1);
    Handle session(WinHttpOpen(
        L"TokenSaver-Phone02-Supervisor/P2.38-B",
        WINHTTP_ACCESS_TYPE_NO_PROXY,
        WINHTTP_NO_PROXY_NAME,
        WINHTTP_NO_PROXY_BYPASS,
        0));
    if (!session.get()) {
        reason = Error(L"WinHttpOpen", GetLastError());
        return false;
    }

    DWORD protocols = WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_2;
    if (!WinHttpSetOption(
            session.get(), WINHTTP_OPTION_SECURE_PROTOCOLS,
            &protocols, sizeof(protocols))) {
        reason = Error(L"SECURE_PROTOCOLS", GetLastError());
        return false;
    }
    WinHttpSetTimeouts(session.get(), kTimeoutMs, kTimeoutMs, kTimeoutMs, kTimeoutMs);

    Handle connection(WinHttpConnect(session.get(), host.c_str(), components.nPort, 0));
    if (!connection.get()) {
        reason = Error(L"WinHttpConnect", GetLastError());
        return false;
    }

    Handle request(WinHttpOpenRequest(
        connection.get(), method, path.c_str(), nullptr,
        WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, WINHTTP_FLAG_SECURE));
    if (!request.get()) {
        reason = Error(L"WinHttpOpenRequest", GetLastError());
        return false;
    }

    DWORD redirect = WINHTTP_OPTION_REDIRECT_POLICY_NEVER;
    if (!WinHttpSetOption(
            request.get(), WINHTTP_OPTION_REDIRECT_POLICY,
            &redirect, sizeof(redirect))) {
        reason = Error(L"REDIRECT_POLICY", GetLastError());
        return false;
    }

    const wchar_t headers[] = L"Content-Type: application/json\r\nAccept: application/json\r\n";
    if (!teamRoomToken_.empty()) {
        std::wstring bearer = L"Authorization: Bearer " + std::wstring(teamRoomToken_.begin(), teamRoomToken_.end());
        if (!WinHttpAddRequestHeaders(request.get(), bearer.c_str(), static_cast<DWORD>(-1L), WINHTTP_ADDREQ_FLAG_ADD | WINHTTP_ADDREQ_FLAG_REPLACE)) {
            reason = Error(L"AUTHORIZATION_HEADER", GetLastError());
            return false;
        }
    }
    if (endpointCredential && !endpointCredential->empty()) {
        std::wstring credential(endpointCredential->begin(), endpointCredential->end());
        if (!WinHttpAddRequestHeaders(request.get(),
            (L"X-AI-Phone-Endpoint-Credential: " + credential).c_str(),
            static_cast<DWORD>(-1L),
            WINHTTP_ADDREQ_FLAG_ADD | WINHTTP_ADDREQ_FLAG_REPLACE)) {
            reason = Error(L"ENDPOINT_CREDENTIAL_HEADER", GetLastError());
            return false;
        }
    }
    LPVOID data = body.empty()
        ? WINHTTP_NO_REQUEST_DATA
        : const_cast<char*>(body.data());

    if (!WinHttpSendRequest(
            request.get(), headers, static_cast<DWORD>(-1L),
            data, static_cast<DWORD>(body.size()),
            static_cast<DWORD>(body.size()), 0)) {
        reason = Error(L"HTTPS_SEND_TLS_OR_TRANSPORT", GetLastError());
        return false;
    }
    if (!WinHttpReceiveResponse(request.get(), nullptr)) {
        reason = Error(L"HTTPS_RECEIVE_TLS_OR_TRANSPORT", GetLastError());
        return false;
    }

    DWORD statusBytes = sizeof(status);
    if (!WinHttpQueryHeaders(
            request.get(),
            WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
            WINHTTP_HEADER_NAME_BY_INDEX, &status, &statusBytes,
            WINHTTP_NO_HEADER_INDEX)) {
        reason = Error(L"HTTP_STATUS", GetLastError());
        return false;
    }

    for (;;) {
        DWORD available = 0;
        if (!WinHttpQueryDataAvailable(request.get(), &available)) {
            reason = Error(L"QUERY_DATA", GetLastError());
            return false;
        }
        if (!available) {
            break;
        }
        if (available > kMaxResponseBytes ||
            response.size() + available > kMaxResponseBytes) {
            reason = L"TEAM_ROOM_RESPONSE_TOO_LARGE";
            return false;
        }
        const size_t old = response.size();
        response.resize(old + available);
        DWORD got = 0;
        if (!WinHttpReadData(
                request.get(), response.data() + old, available, &got)) {
            reason = Error(L"READ_DATA", GetLastError());
            return false;
        }
        response.resize(old + got);
        if (!got) {
            break;
        }
    }

    return true;
}

bool RealSupervisorTeamRoomHttpsAdapter::parseStringField(
    const std::string& json, const char* key, std::string& out) const {
    return ExtractJsonString(json, key, out);
}

bool RealSupervisorTeamRoomHttpsAdapter::parseUuidField(
    const std::string& json, const char* key, std::string& out) const {
    return ExtractJsonString(json, key, out) && ParseUuid(out);
}

bool ParseUInt64Field(const std::string& json, const std::string& key, std::uint64_t& out) {
    const std::string needle = "\"" + key + "\"";
    const size_t keyPos = json.find(needle);
    if (keyPos == std::string::npos) return false;
    const size_t colon = json.find(':', keyPos + needle.size());
    if (colon == std::string::npos) return false;
    size_t pos = colon + 1;
    while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\t' ||
                                 json[pos] == '\r' || json[pos] == '\n')) ++pos;
    size_t end = pos;
    while (end < json.size() && json[end] >= '0' && json[end] <= '9') ++end;
    if (end == pos) return false;
    try {
        out = std::stoull(json.substr(pos, end - pos));
        return true;
    } catch (...) {
        return false;
    }
}

bool RealSupervisorTeamRoomHttpsAdapter::parsePhoneId(
    const std::string& json, std::string& out) const {
    const size_t phonePos = json.find("\"phone\"");
    if (phonePos == std::string::npos) {
        return false;
    }
    const size_t phoneEnd = json.find("\"attachment\"", phonePos);
    const std::string segment = json.substr(
        phonePos, phoneEnd == std::string::npos ? json.size() - phonePos : phoneEnd - phonePos);
    return parseUuidField(segment, "ai_phone_id", out);
}

std::string RealSupervisorTeamRoomHttpsAdapter::jsonEscape(const std::string& value) {
    std::string result;
    result.reserve(value.size() + 16);
    for (unsigned char ch : value) {
        switch (ch) {
        case '"': result += "\\\""; break;
        case '\\': result += "\\\\"; break;
        case '\b': result += "\\b"; break;
        case '\f': result += "\\f"; break;
        case '\n': result += "\\n"; break;
        case '\r': result += "\\r"; break;
        case '\t': result += "\\t"; break;
        default:
            if (ch < 0x20) {
                return {};
            }
            result.push_back(static_cast<char>(ch));
            break;
        }
    }
    return result;
}

bool RealSupervisorTeamRoomHttpsAdapter::authenticate(
    const std::string& workload_assertion) {
    if (workload_assertion.empty() || workload_assertion.size() > 16384 ||
        roomId_.empty() || !ParseUuid(roomId_)) {
        return false;
    }

    // The OIDC assertion is exchanged without a pre-existing Team Room bearer.
    // Clear a stale session before retrying so it can never be sent to /auth/exchange.
    if (!teamRoomToken_.empty()) {
        SecureZeroMemory(teamRoomToken_.data(), teamRoomToken_.size());
        teamRoomToken_.clear();
    }

    std::string body =
        "{\"room_id\":\"" + jsonEscape(roomId_) +
        "\",\"workload_token\":\"" + jsonEscape(workload_assertion) + "\"}";
    std::string response;
    DWORD status = 0;
    std::wstring reason;
    if (!request(L"POST", L"/auth/exchange", body, response, status, reason) ||
        status != 200) {
        return false;
    }

    std::string token;
    std::string session;
    std::string execution;
    std::string responseRoom;
    if (!parseStringField(response, "access_token", token) ||
        !parseUuidField(response, "session_id", session) ||
        !parseUuidField(response, "execution_id", execution) ||
        !parseUuidField(response, "room_id", responseRoom) ||
        responseRoom != roomId_) {
        return false;
    }
    if (token.size() < 32 || token.size() > 4096) {
        return false;
    }

    if (!teamRoomToken_.empty()) {
        SecureZeroMemory(teamRoomToken_.data(), teamRoomToken_.size());
    }
    teamRoomToken_ = std::move(token);
    attachment_.team_room_session_id = session;
    attachment_.execution_id = execution;
    return true;
}

bool RealSupervisorTeamRoomHttpsAdapter::attach(
    const ProvisionedPhoneBinding& binding, TeamRoomAttachment& out) {
    if (teamRoomToken_.empty() || binding.ai_phone_id.empty() ||
        binding.endpoint_id.empty()) {
        return false;
    }
    if (!ParseUuid(binding.ai_phone_id) || !ParseUuid(binding.endpoint_id)) {
        return false;
    }

    // The server is authoritative for session identity. The local provisioned
    // phone id is only accepted after /ai-phone/me returns the same server-owned id.
    std::string me;
    DWORD status = 0;
    std::wstring reason;
    if (!request(L"GET", L"/auth/me", "", me, status, reason) || status != 200) {
        return false;
    }

    std::string principal;
    std::string session;
    std::string execution;
    std::string room;
    if (!parseUuidField(me, "principal_id", principal) ||
        !parseUuidField(me, "session_id", session) ||
        !parseUuidField(me, "execution_id", execution) ||
        !parseUuidField(me, "room_id", room) ||
        room != roomId_ ||
        session != attachment_.team_room_session_id ||
        execution != attachment_.execution_id) {
        return false;
    }

    std::string phoneSnapshot;
    if (!request(L"GET", L"/ai-phone/me", "", phoneSnapshot, status, reason) ||
        status != 200) {
        return false;
    }
    std::string serverPhoneId;
    if (!parsePhoneId(phoneSnapshot, serverPhoneId) ||
        serverPhoneId != binding.ai_phone_id) {
        return false;
    }

    if (binding.endpoint_credential.empty() || binding.endpoint_credential.size() > 4096) {
        return false;
    }

    const std::string attachBody =
        "{\"endpoint_id\":\"" + binding.endpoint_id +
        "\",\"endpoint_type\":\"MOBILE\",\"metadata\":{\"package_family\":\"" + jsonEscape(binding.package_family) +
        "\",\"package_full_name\":\"" + jsonEscape(binding.package_full_name) +
        "\",\"appcontainer_sid\":\"" + jsonEscape(binding.appcontainer_sid) + "\"}}";

    // The endpoint credential is required by the phone API and is never sent to
    // the Team Room auth exchange. It is retained only in this Supervisor process.
    std::string phoneAttachment;
    if (!request(
            L"POST", L"/ai-phone/attach", attachBody, phoneAttachment,
            status, reason, &binding.endpoint_credential) ||
        status != 201) {
        return false;
    }

    std::string attachmentId;
    std::string attachedEndpoint;
    std::uint64_t serverFence = 0;
    if (!parseUuidField(phoneAttachment, "attachment_id", attachmentId) ||
        !parseUuidField(phoneAttachment, "endpoint_id", attachedEndpoint) ||
        !ParseUInt64Field(phoneAttachment, "endpoint_fence", serverFence) ||
        attachedEndpoint != binding.endpoint_id) {
        return false;
    }

    std::string joined;
    if (!request(
            L"POST", L"/team-room/" + std::wstring(roomId_.begin(), roomId_.end()) + L"/join",
            "", joined, status, reason) ||
        status != 200) {
        return false;
    }

    attachment_.attachment_id = attachmentId;
    attachment_.sender_ai_phone_id = binding.ai_phone_id;
    attachment_.endpoint_id = attachedEndpoint;
    attachment_.endpoint_fence = serverFence;
    attachment_.team_room_session_id = session;
    attachment_.execution_id = execution;
    endpointCredential_ = binding.endpoint_credential;
    out = attachment_;
    return true;
}

bool RealSupervisorTeamRoomHttpsAdapter::heartbeat(
    const TeamRoomAttachment& attachment) {
    if (attachment.team_room_session_id != attachment_.team_room_session_id ||
        attachment.execution_id != attachment_.execution_id ||
        teamRoomToken_.empty()) {
        return false;
    }
    std::string response;
    DWORD status = 0;
    std::wstring reason;
    const std::string phoneBody =
        "{\"endpoint_fence\":" + std::to_string(attachment.endpoint_fence) + "}";
    if (endpointCredential_.empty() ||
        !request(L"POST", L"/ai-phone/heartbeat", phoneBody, response,
                 status, reason, &endpointCredential_) ||
        status != 200) {
        return false;
    }
    if (!request(L"POST", L"/team-room/heartbeat", "", response,
                 status, reason) ||
        status != 200) {
        return false;
    }
    std::string session;
    std::string execution;
    return parseUuidField(response, "session_id", session) &&
           parseUuidField(response, "execution_id", execution) &&
           session == attachment.team_room_session_id &&
           execution == attachment.execution_id;
}

bool RealSupervisorTeamRoomHttpsAdapter::reconnect(
    const TeamRoomAttachment& attachment, const std::string&) {
    if (attachment.team_room_session_id != attachment_.team_room_session_id ||
        attachment.execution_id != attachment_.execution_id ||
        endpointCredential_.empty() || teamRoomToken_.empty()) {
        return false;
    }
    std::string response;
    DWORD status = 0;
    std::wstring reason;
    const std::string body =
        "{\"endpoint_id\":\"" + attachment.endpoint_id +
        "\",\"endpoint_type\":\"MOBILE\",\"metadata\":{}}";
    if (!request(L"POST", L"/ai-phone/reconnect", body, response,
                 status, reason, &endpointCredential_) || status != 200) {
        return false;
    }
    std::string attachmentId;
    std::string endpointId;
    std::uint64_t fence = 0;
    if (!parseUuidField(response, "attachment_id", attachmentId) ||
        !parseUuidField(response, "endpoint_id", endpointId) ||
        !ParseUInt64Field(response, "endpoint_fence", fence) ||
        endpointId != attachment.endpoint_id) {
        return false;
    }
    attachment_.attachment_id = attachmentId;
    attachment_.endpoint_fence = fence;
    return true;
}

bool RealSupervisorTeamRoomHttpsAdapter::detach(
    const TeamRoomAttachment& attachment) {
    if (attachment.team_room_session_id != attachment_.team_room_session_id ||
        attachment.execution_id != attachment_.execution_id) {
        return false;
    }
    std::string response;
    DWORD status = 0;
    std::wstring reason;
    const std::wstring path =
        L"/team-room/" + std::wstring(roomId_.begin(), roomId_.end()) + L"/leave";
    std::string phoneResponse;
    if (endpointCredential_.empty() ||
        !request(L"POST", L"/ai-phone/detach",
                 "{\"endpoint_fence\":" + std::to_string(attachment.endpoint_fence) + "}",
                 phoneResponse, status, reason, &endpointCredential_) ||
        status != 204) {
        return false;
    }
    if (!request(L"POST", path, "", response, status, reason) || status != 204) {
        return false;
    }
    attachment_ = {};
    endpointCredential_.clear();
    return true;
}

bool RealSupervisorTeamRoomHttpsAdapter::send(
    const TeamRoomAttachment& attachment,
    const std::string&,
    const std::string& envelope,
    const std::string& idempotency_key,
    TeamRoomMessage& receipt) {
    if (attachment.team_room_session_id != attachment_.team_room_session_id ||
        attachment.execution_id != attachment_.execution_id ||
        envelope.empty() || envelope.size() > 12000 ||
        idempotency_key.empty() || idempotency_key.size() > 200) {
        return false;
    }
    std::string clientMessageId = idempotency_key;
    if (!ParseUuid(clientMessageId)) {
        clientMessageId = UuidString();
    }
    if (clientMessageId.empty()) {
        return false;
    }
    const std::string escapedBody = jsonEscape(envelope);
    if (escapedBody.empty()) {
        return false;
    }

    const std::string body =
        "{\"client_message_id\":\"" + clientMessageId +
        "\",\"body\":\"" + escapedBody +
        "\",\"parent_message_id\":null}";
    std::string response;
    DWORD status = 0;
    std::wstring reason;
    const std::wstring path =
        L"/team-room/" + std::wstring(roomId_.begin(), roomId_.end()) + L"/messages";
    if (!request(L"POST", path, body, response, status, reason) ||
        (status != 200 && status != 201)) {
        return false;
    }

    std::string messageId;
    if (!parseUuidField(response, "message_id", messageId)) {
        return false;
    }
    receipt.message_id = messageId;
    receipt.sender_ai_phone_id = attachment.sender_ai_phone_id;
    receipt.payload = envelope;
    return true;
}

bool RealSupervisorTeamRoomHttpsAdapter::receive(
    const TeamRoomAttachment& attachment,
    std::vector<TeamRoomMessage>& out) {
    if (attachment.team_room_session_id != attachment_.team_room_session_id ||
        attachment.execution_id != attachment_.execution_id) {
        return false;
    }
    std::string response;
    DWORD status = 0;
    std::wstring reason;
    const std::wstring path =
        L"/team-room/" + std::wstring(roomId_.begin(), roomId_.end()) + L"/messages?limit=50";
    if (!request(L"GET", path, "", response, status, reason) || status != 200) {
        return false;
    }

    // General-room history is principal-addressed by the server. Preserve the
    // authenticated sender principal as the message sender field; direct
    // AI-phone mailbox delivery remains a separate endpoint.
    out.clear();
    size_t cursor = 0;
    while ((cursor = response.find("\"message_id\"", cursor)) != std::string::npos) {
        const size_t itemEnd = response.find("\"message_id\"", cursor + 1);
        const std::string item = response.substr(
            cursor, itemEnd == std::string::npos ? response.size() - cursor : itemEnd - cursor);
        std::string messageId;
        std::string senderPrincipal;
        std::string body;
        if (parseUuidField(item, "message_id", messageId) &&
            parseUuidField(item, "sender_principal_id", senderPrincipal) &&
            parseStringField(item, "body", body)) {
            out.push_back(TeamRoomMessage{messageId, senderPrincipal, body});
        }
        cursor += 13;
        if (out.size() >= 50) {
            break;
        }
    }
    return true;
}

bool RealSupervisorTeamRoomHttpsAdapter::ack(
    const TeamRoomAttachment& attachment, const std::string&) {
    // Team Room general messages use read receipts rather than per-message ACK.
    // The history endpoint records the caller's read watermark.
    std::vector<TeamRoomMessage> ignored;
    return receive(attachment, ignored);
}

bool RealSupervisorTeamRoomHttpsAdapter::revoke(
    const TeamRoomAttachment& attachment) {
    if (attachment.team_room_session_id != attachment_.team_room_session_id ||
        attachment.execution_id != attachment_.execution_id) {
        return false;
    }
    std::string response;
    DWORD status = 0;
    std::wstring reason;
    if (!request(L"POST", L"/auth/logout", "", response, status, reason) ||
        status != 204) {
        return false;
    }
    Clear();
    return true;
}

} // namespace phone_supervisor
