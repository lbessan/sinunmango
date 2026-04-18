cd D:\Projects\finanzas-lb

rd /s /q "D:\Projects\finanzas-lb\.git"

git init
git branch -m main
git add .
git commit -m "Initial commit — sinunmango app"
git remote add origin https://github.com/lbessan/sinunmango.git
git push -u origin main

pause