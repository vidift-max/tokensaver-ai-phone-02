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
3. Digitar uma missão e tocar em **Compartilhar com ChatGPT**; confirmar que o Android abre a folha de compartilhamento.
4. Selecionar a segunda sessão ChatGPT e enviar manualmente.
5. Na resposta, usar Compartilhar e procurar **Ponte entre IAs**; se não aparecer, copiar a resposta e colar no campo.
6. Tocar em **Copiar resposta para GPT-6**, voltar à conversa GPT-6 no navegador e colar.
7. Confirmar que a limpeza remove os textos locais.

Não considerar a integração funcional até executar os passos reais em um tablet Android.
