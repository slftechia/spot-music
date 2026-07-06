@echo off
echo === Spot Music - Deploy no Render ===
echo.
echo 1. Crie um repositorio em https://github.com/new (nome: spot-music)
echo 2. Execute:
echo    git remote set-url origin https://github.com/SEU-USUARIO/spot-music.git
echo    git push -u origin main
echo 3. Acesse https://dashboard.render.com/blueprints
echo 4. New Blueprint ^> conecte o repositorio
echo 5. O render.yaml ja esta configurado - deploy automatico!
echo.
echo URL final: https://spot-music.onrender.com
pause
