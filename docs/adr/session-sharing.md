# ADR: compartilhamento interno por sessão

Status: aceito em 2026-10-03

Um proxy HTTP no endereço LAN/Tailscale escolhido e uma porta de 8181 a 8280 encaminha para a API original, que mantém sua chave permanente. O proxy usa uma credencial aleatória própria, mantida somente em memória. O link leva a credencial no fragmento; a página de entrada remove o fragmento e troca por cookie HttpOnly/SameSite Strict via POST de mesma origem. Comandos OpenCode com acesso usam a mesma credencial como Bearer na API do proxy. Revogar gira a credencial e fecha conexões existentes; parar fecha o proxy. Reiniciar gera outra credencial. O fluxo manual que usa a chave permanente permanece independente. As regras de firewall liberam somente os dois executáveis, suas portas ativas e a faixa solicitada. Tailscale é preferido; HTTP em LAN não cifra o tráfego.
