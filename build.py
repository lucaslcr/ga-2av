#!/usr/bin/env python3
"""Gera public/index.html a partir do artefato, com a sincronização (usuário + PIN).

Uso: python3 build.py [caminho/do/ga-2av.html]
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'src', 'ga-2av.html')


def rep(s, old, new):
    assert s.count(old) == 1, 'trecho não encontrado (ou repetido): ' + old[:70]
    return s.replace(old, new)


s = open(SRC, encoding='utf-8').read()
css = open(os.path.join(HERE, 'src', 'sync.css'), encoding='utf-8').read()
js = open(os.path.join(HERE, 'src', 'sync.js'), encoding='utf-8').read()

# 1. save() avisa a sincronização
s = rep(s, "function save(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}}",
        "function save(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}if(window.GASync)GASync.dirty();}")
# 2. rótulo do progresso e gancho depois de cada render
s = rep(s, "<span>Progresso salvo neste navegador</span>",
        "<span>'+(window.GASync?GASync.label():'Progresso salvo neste navegador')+'</span>")
s = rep(s, "  var tr=document.getElementById('tring');tr.setAttribute(",
        "  if(window.GASync)GASync.after(pg);\n  var tr=document.getElementById('tring');tr.setAttribute(")
# 3. expõe o estado para o script de sincronização
s = rep(s, "render();\n})();\n</script>",
        "window.GA={S:function(){return S;},setS:function(o){S=o;try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}render();},"
        "render:render,toast:toast};\nrender();\n})();\n</script>")
# 4. lugares da conta: barra lateral e barra do topo (celular)
s = rep(s, '<div class="sprog" id="sprog"></div>\n</aside>',
        '<div class="sprog" id="sprog"></div>\n  <div class="acct" id="acct"></div>\n</aside>')
s = rep(s, '<button class="themebtn" id="thb2" type="button"></button>',
        '<button class="acctbtn" id="acct2" type="button" aria-label="Entrar ou criar conta"></button><button class="themebtn" id="thb2" type="button"></button>')
s = rep(s, '.topbar .ring{margin-left:0}.topbar .themebtn{margin-left:auto}',
        '.topbar .ring{margin-left:0}.topbar .acctbtn{margin-left:auto}')
# 5. CSS e JS da sincronização
s = rep(s, '</style>\n\n<aside', css + '</style>\n\n<aside')
s = s.rstrip() + '\n<script>\n' + js + '</script>\n'

# 6. documento completo (o artefato não tem <head>/<body>)
i = s.index('<aside')
top, rest = s[:i], s[i:]
html = ('<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
        'img{max-width:100%}[hidden]{display:none!important}</style>\n'
        + top + '</head>\n<body>\n' + rest + '\n</body>\n</html>\n')

out = os.path.join(HERE, 'public', 'index.html')
os.makedirs(os.path.dirname(out), exist_ok=True)
open(out, 'w', encoding='utf-8').write(html)
print('ok:', out, len(html), 'bytes')
