# ADR: iniciar servidor sem abrir navegador

Status: aceito em 2026-10-03

O launcher deve servir clientes API, incluindo OpenCode em VMs, sem obrigar a abertura de uma página. Mantemos o canal de início existente com a opção `openBrowser`, que preserva o comportamento anterior por padrão. O botão Iniciar servidor passa false; Abrir no navegador reutiliza o servidor ativo. O endpoint e os controles de rede aparecem nos dois fluxos. A versão 0.3.0 adiciona a funcionalidade conforme SemVer e incorpora a correção de console Windows da 0.2.10.
