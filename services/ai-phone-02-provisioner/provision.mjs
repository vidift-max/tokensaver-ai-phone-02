import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';
const { Pool } = pg;
const e = process.env;
const need = ['DATABASE_URL','KEYCLOAK_URL','KEYCLOAK_ADMIN_PASSWORD','PHONE02_CLIENT_SECRET','PHONE02_ENDPOINT_CREDENTIAL','TEAM_ROOM_ROOM_ID','AI_PHONE_ID','PHONE02_TENANT_ID','PHONE02_ENDPOINT_ID'];
for (const k of need) if (!e[k]) throw new Error(k + ' is required');
const realm='team-room', clientId='ai-phone-02-runtime', audience='team-room-api', scopeName='team_room:connect';
const base=e.KEYCLOAK_URL.replace(/\/+$/,'');
const issuer=base+'/realms/'+realm;
async function kc(path,opt={}) { const r=await fetch(base+path,{redirect:'error',...opt,headers:{'content-type':'application/json',...(opt.headers||{})}}); const t=await r.text(); let b=null; try{b=t?JSON.parse(t):null}catch{} if(!r.ok){const x=new Error('Keycloak '+r.status+' '+path);x.status=r.status;throw x} return b; }
async function adminToken(){ const body=new URLSearchParams({client_id:'admin-cli',username:e.KEYCLOAK_ADMIN_USERNAME||'phone02-admin',password:e.KEYCLOAK_ADMIN_PASSWORD,grant_type:'password'}); const r=await fetch(base+'/realms/master/protocol/openid-connect/token',{method:'POST',redirect:'error',headers:{'content-type':'application/x-www-form-urlencoded'},body}); if(!r.ok) throw new Error('Keycloak admin token failed '+r.status); return (await r.json()).access_token; }
async function adm(token,path,opt={}){return kc(path,{...opt,headers:{authorization:'Bearer '+token,...(opt.headers||{})}})}
async function setupKeycloak(token){
 try{await adm(token,'/admin/realms/'+realm)}catch(x){if(x.status!==404)throw x;await adm(token,'/admin/realms',{method:'POST',body:JSON.stringify({realm,enabled:true,sslRequired:'external',accessTokenLifespan:300})})}
 let scopes=await adm(token,'/admin/realms/'+realm+'/client-scopes');
 let scope=scopes.find(x=>x.name===scopeName);
 if(!scope){await adm(token,'/admin/realms/'+realm+'/client-scopes',{method:'POST',body:JSON.stringify({name:scopeName,protocol:'openid-connect',attributes:{'include.in.token.scope':'true'}})});scopes=await adm(token,'/admin/realms/'+realm+'/client-scopes');scope=scopes.find(x=>x.name===scopeName)}
 if(!scope)throw new Error('OIDC scope missing');
 let clients=await adm(token,'/admin/realms/'+realm+'/clients?clientId='+encodeURIComponent(clientId));
 let client=clients[0];
 if(!client){await adm(token,'/admin/realms/'+realm+'/clients',{method:'POST',body:JSON.stringify({clientId,enabled:true,protocol:'openid-connect',publicClient:false,serviceAccountsEnabled:true,standardFlowEnabled:false,directAccessGrantsEnabled:false,secret:e.PHONE02_CLIENT_SECRET})});clients=await adm(token,'/admin/realms/'+realm+'/clients?clientId='+encodeURIComponent(clientId));client=clients[0]}
 if(!client?.id)throw new Error('OIDC client missing');
 try{await adm(token,'/admin/realms/'+realm+'/clients/'+client.id+'/optional-client-scopes/'+scope.id,{method:'PUT'})}catch(x){if(x.status!==409&&x.status!==204)throw x}
 const maps=await adm(token,'/admin/realms/'+realm+'/clients/'+client.id+'/protocol-mappers/models');
 if(!maps.some(x=>x.name==='team-room-audience')) await adm(token,'/admin/realms/'+realm+'/clients/'+client.id+'/protocol-mappers/models',{method:'POST',body:JSON.stringify({name:'team-room-audience',protocol:'openid-connect',protocolMapper:'oidc-audience-mapper',config:{'included.custom.audience':audience,'access.token.claim':'true','id.token.claim':'false','userinfo.token.claim':'false'}})});
 const user=await adm(token,'/admin/realms/'+realm+'/clients/'+client.id+'/service-account-user');
 if(!user?.id)throw new Error('service account subject missing');
 return user.id;
}
async function setupDb(subject){
 const pool=new Pool({connectionString:e.DATABASE_URL,max:2});const c=await pool.connect();
 try{await c.query('BEGIN');const tenant=e.PHONE02_TENANT_ID,room=e.TEAM_ROOM_ROOM_ID,phone=e.AI_PHONE_ID,endpoint=e.PHONE02_ENDPOINT_ID;
 await c.query('INSERT INTO tenants(tenant_id,name) VALUES($1,$2) ON CONFLICT DO NOTHING',[tenant,'AI-PHONE-02 production tenant']);
 await c.query('INSERT INTO rooms(room_id,tenant_id,name) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[room,tenant,'AI-PHONE-02 persistent room']);
 let q=await c.query('SELECT principal_id FROM principals WHERE tenant_id=$1 AND provider=$2 AND external_subject=$3 LIMIT 1',[tenant,issuer,subject]);
 const principal=q.rows[0]?.principal_id||crypto.randomUUID();
 await c.query("INSERT INTO principals(principal_id,tenant_id,principal_kind,provider,external_subject) VALUES($1,$2,'AI',$3,$4) ON CONFLICT DO NOTHING",[principal,tenant,issuer,subject]);
 await c.query('UPDATE principals SET enabled=TRUE,provider=$2,external_subject=$3 WHERE principal_id=$1',[principal,issuer,subject]);
 q=await c.query('SELECT participant_id FROM participants WHERE tenant_id=$1 AND principal_id=$2 LIMIT 1',[tenant,principal]);
 const participant=q.rows[0]?.participant_id||crypto.randomUUID();
 await c.query("INSERT INTO participants(participant_id,tenant_id,principal_id,display_name) VALUES($1,$2,$3,'AI-PHONE-02') ON CONFLICT DO NOTHING",[participant,tenant,principal]);
 q=await c.query('SELECT workload_id FROM workload_identities WHERE tenant_id=$1 AND principal_id=$2 AND issuer=$3 AND subject=$4 LIMIT 1',[tenant,principal,issuer,subject]);
 if(!q.rows[0]) await c.query("INSERT INTO workload_identities(workload_id,tenant_id,principal_id,issuer,subject,status) VALUES($1,$2,$3,$4,$5,'ACTIVE')",[crypto.randomUUID(),tenant,principal,issuer,subject]);
 await c.query("UPDATE workload_identities SET status='ACTIVE' WHERE tenant_id=$1 AND principal_id=$2 AND issuer=$3 AND subject=$4",[tenant,principal,issuer,subject]);
 await c.query("INSERT INTO ai_identities(ai_id,identity_key,identity_kind,display_label) VALUES($1,'ai-phone-02:external','EXTERNAL','AI-PHONE-02') ON CONFLICT DO NOTHING",[crypto.randomUUID()]);
 const ai=(await c.query("SELECT ai_id FROM ai_identities WHERE identity_key='ai-phone-02:external'")).rows[0].ai_id;
 await c.query('INSERT INTO ai_identity_principals(ai_id,tenant_id,principal_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[ai,tenant,principal]);
 await c.query('INSERT INTO ai_identity_tenants(ai_id,tenant_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[ai,tenant]);
 await c.query("INSERT INTO ai_phones(ai_phone_id,ai_id,phone_status) VALUES($1,$2,'DISCONNECTED') ON CONFLICT DO NOTHING",[phone,ai]);
 await c.query("INSERT INTO phone_endpoints(endpoint_id,ai_phone_id,endpoint_type,endpoint_status,metadata) VALUES($1,$2,'WORKER','REGISTERED',$3) ON CONFLICT DO NOTHING",[endpoint,phone,JSON.stringify({label:'AI-PHONE-02 independent runtime'})]);
 const hash=crypto.createHash('sha256').update(e.PHONE02_ENDPOINT_CREDENTIAL).digest();
 await c.query("INSERT INTO phone_endpoint_credentials(credential_id,endpoint_id,ai_phone_id,tenant_id,ai_id,credential_hash,endpoint_fence,expires_at) VALUES($1,$2,$3,$4,$5,$6,NULL,NOW()+INTERVAL '365 days') ON CONFLICT DO NOTHING",[crypto.randomUUID(),endpoint,phone,tenant,ai,hash]);
 for(const p of ['room.join','room.read','phone.read','phone.attach','phone.detach','phone.heartbeat','phone.message.read','phone.message.send','phone.message.ack']) await c.query('INSERT INTO principal_permissions(permission_id,tenant_id,principal_id,room_id,permission) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[crypto.randomUUID(),tenant,principal,room,p]);
 await c.query('COMMIT');console.log(JSON.stringify({status:'provisioned',issuer,phone_id:phone,endpoint_id:endpoint,room_id:room,principal_id:principal,subject}));
 }catch(x){await c.query('ROLLBACK');throw x}finally{c.release();await pool.end()}
}
async function run(){let attempt=0;for(;;){attempt++;try{const t=await adminToken();const s=await setupKeycloak(t);await setupDb(s);console.log(JSON.stringify({event:'provisioning_complete',attempt}));return}catch(x){console.error(JSON.stringify({event:'provisioning_retry',attempt,error:x.message}));await new Promise(r=>setTimeout(r,15000))}}}
const server=http.createServer((req,res)=>{if(req.method==='GET'&&req.url==='/health/live'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({service:'ai-phone-02-provisioner',status:'live'}));return}res.writeHead(404);res.end()});
server.listen(Number(e.PORT||10000),'0.0.0.0',()=>{console.log('provisioner listening; waiting for Keycloak and retrying until provisioning succeeds');run().catch(x=>{console.error('unexpected provisioning loop failure',x.message);process.exitCode=1})});