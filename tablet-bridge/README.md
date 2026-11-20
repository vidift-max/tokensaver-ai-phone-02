# Ponte entre IAs — PWA para Android

Ponte local e assistida para transferir texto entre duas sessões ChatGPT abertas em apps diferentes no mesmo tablet.

## O que esta versão faz

- Guarda a missão e a resposta em `localStorage` no próprio navegador.
- Abre o compartilhamento nativo do Android para enviar a missão ao ChatGPT.
- Declara um Web Share Target para receber texto compartilhado pelo ChatGPT quando o navegador/instalação PWA e a origem suportarem esse fluxo.
- Oferece colagem manual e cópia como fallback.
- Funciona sem API de IA, conta, servidor de banco de dados ou chave secreta.

## Limites importantes

- Não controla a tela nem clica/digita dentro do ChatGPT.
- Não envia mensagens automaticamente nem lê conversas privadas.
- O usuário escolhe o app de destino e confirma cada compartilhamento.
- O recebimento por Compartilhar depende do Android/Chrome oferecer esta PWA instalada como destino; se não aparecer, use copiar/colar.
- Os dados locais podem ser apagados pelo usuário ao limpar os dados do navegador/PWA. O botão **Limpar sessão** apaga os dois campos da aplicação.

## Publicação

Servir esta pasta como conteúdo estático em HTTPS. O caminho de publicação deve manter a pasta `tablet-bridge/` como escopo da PWA, ou adaptar `start_url`, `scope`, caminhos do service worker e `share_target.action` juntos.

## Teste manual no tablet

1. Abrir o endereço HTTPS desta pasta no Chrome Android.
2. Instalar pelo menu do navegador, se a opção estiver disponível.
3. Na conversa GPT-6, copiar a missão; na Ponte, tocar em **Colar missão copiada**.
4. Tocar em **Compartilhar com ChatGPT**, selecionar a segunda sessão e confirmar o envio.
5. Na resposta da IA-2, tentar Compartilhar → **Ponte entre IAs**. Algumas versões do ChatGPT podem compartilhar um link da conversa, não o texto da resposta; nesse caso, copiar a resposta e usar **Colar resposta copiada** na Ponte.
6. Tocar em **Copiar resposta para GPT-6**, voltar à conversa GPT-6 no navegador e colar.
7. Confirmar que a limpeza remove os textos locais e a mensagem pendente do service worker.

Não considerar a integração funcional até executar os passos reais em um tablet Android.

## Configuração de publicação no Render (não executada)

Para disponibilizar a PWA em HTTPS, criar um serviço **Static Site** no workspace AI-PHONE-02 com:

- Repository: `https://github.com/vidift-max/tokensaver-ai-phone-02`
- Branch: `feature/tablet-chatgpt-bridge-pwa` (ou a branch aprovada após merge)
- Build command: `echo "No build required"`
- Publish directory: `tablet-bridge`
- Auto-deploy: desativado até autorização explícita.

O Render fornece HTTPS para o subdomínio do serviço. Serviço público e consumo de banda dependem das condições/limites do plano; revisar o painel antes de criar. A criação e o deploy não foram executados.

## Revisão da implementação

O handler de um botão de salvamento removido foi eliminado para evitar referência a elemento inexistente durante a inicialização. O fluxo atual salva automaticamente ao editar os campos; a regressão está coberta pelo teste de UI.
