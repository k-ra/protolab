t=open("template.html").read(); d=open("data.b64").read()
open("sf.html","w").write(t.replace("__DATA__",d))
