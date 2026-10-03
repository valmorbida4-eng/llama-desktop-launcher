# CLI externa com console visível no Windows

A chamada direta de PowerShell com stdio ignorado encerrou sem abrir janela. O launcher agora usa um bootstrap PowerShell para Start-Process com WindowStyle Normal. O bootstrap recebe código UTF-16 em base64 e argumentos tratados como literais, sem cmd.exe. A promessa aguarda o bootstrap e propaga falhas ao usuário. O modelo continua executando no terminal interativo separado. Linux e macOS preservam suas chamadas existentes.
