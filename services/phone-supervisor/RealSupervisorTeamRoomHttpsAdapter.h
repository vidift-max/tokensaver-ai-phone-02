#pragma once
#include <windows.h>
#include <string>
#include <vector>
#include "SupervisorTeamRoomAdapter.h"

namespace phone_supervisor {

class RealSupervisorTeamRoomHttpsAdapter final : public SupervisorTeamRoomAdapter {
public:
    static bool ValidateEndpoint(const std::wstring& endpoint, std::wstring& reason);

    bool ProbeHealth(const std::wstring& endpoint, DWORD& httpStatus, std::wstring& reason) const;

    // Real Team Room session lifecycle. workload_assertion is the OIDC access token
    // acquired by the privileged Supervisor and is never logged or exposed to RPC.
    bool authenticate(const std::string& workload_assertion) override;
    bool attach(const ProvisionedPhoneBinding& binding, TeamRoomAttachment& out) override;
    bool heartbeat(const TeamRoomAttachment& attachment) override;
    bool reconnect(const TeamRoomAttachment& attachment, const std::string& fresh_challenge) override;
    bool detach(const TeamRoomAttachment& attachment) override;
    bool send(const TeamRoomAttachment& attachment,
              const std::string& target_phone_id,
              const std::string& envelope,
              const std::string& idempotency_key,
              TeamRoomMessage& receipt) override;
    bool receive(const TeamRoomAttachment& attachment,
                 std::vector<TeamRoomMessage>& out) override;
    bool ack(const TeamRoomAttachment& attachment, const std::string& message_id) override;
    bool revoke(const TeamRoomAttachment& attachment) override;

    void Configure(const std::wstring& endpoint, const std::string& room_id);
    bool authenticated() const noexcept { return !teamRoomToken_.empty(); }
    const std::string& roomId() const noexcept { return roomId_; }
    void Clear();

private:
    bool request(const wchar_t* method,
                 const std::wstring& path,
                 const std::string& body,
                 std::string& response,
                 const std::string* endpointCredential = nullptr,
                 DWORD& status,
                 std::wstring& reason) const;
    bool parseUuidField(const std::string& json, const char* key, std::string& out) const;
    bool parseStringField(const std::string& json, const char* key, std::string& out) const;
    bool parsePhoneId(const std::string& json, std::string& out) const;
    static std::string jsonEscape(const std::string& value);
    static std::wstring Error(const wchar_t* operation, DWORD code);

    std::wstring endpoint_;
    std::string roomId_;
    std::string teamRoomToken_;
    TeamRoomAttachment attachment_;
};

} // namespace phone_supervisor
