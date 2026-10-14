import json,glob,os,collections,datetime
def ts(d):
    try:return datetime.datetime.fromisoformat(d["timestamp"].replace("Z","+00:00"))
    except:return None
uses={}; reads=[]; blank_ratio=[]; overlap=[]; json_overhead=0; raw_total=0
exec_to_read=[]; reread_gap=[]; last_exec={}; last_read={}
desc_len=[]; prop_echo=0
for f in glob.glob(os.path.expanduser("~/.claude/projects/*/*.jsonl")):
    for l in open(f,errors="ignore"):
        try:d=json.loads(l)
        except:continue
        c=d.get("message",{}).get("content");t=ts(d)
        if not isinstance(c,list):continue
        for x in c:
            if x.get("type")=="tool_use" and x.get("name","").startswith("mcp__iterm2__"):
                n=x["name"][13:];inp=x.get("input",{});uses[x["id"]]=(n,inp,t,f)
                if n=="propose_command":desc_len.append(len(inp.get("description","")))
            elif x.get("type")=="tool_result" and x.get("tool_use_id") in uses:
                n,inp,t0,ff=uses[x["tool_use_id"]];cc=x.get("content")
                txt=cc if isinstance(cc,str) else " ".join(y.get("text","") for y in cc or [] if isinstance(y,dict))
                sid=(ff,inp.get("session_id"))
                if n=="execute_command":last_exec[sid]=t0
                if n=="read_session_output":
                    try:o=json.loads(txt)["output"]
                    except:continue
                    raw_total+=len(o);json_overhead+=len(txt)-len(o)
                    ls=o.split("\n");blank_ratio.append(sum(1 for z in ls if not z.strip())/max(len(ls),1))
                    if sid in last_read:
                        prev,pt=last_read[sid]
                        a=set(prev.split("\n"))-{""};b=[z for z in ls if z.strip()]
                        if b:overlap.append(sum(1 for z in b if z in a)/len(b))
                        if t0 and pt:reread_gap.append((t0-pt).total_seconds())
                    if sid in last_exec and t0 and last_exec[sid]:exec_to_read.append((t0-last_exec[sid]).total_seconds());del last_exec[sid]
                    last_read[sid]=(o,t0)
def q(a):
    a=sorted(a);return f"n={len(a)} p25={a[len(a)//4]:.2f} p50={a[len(a)//2]:.2f} p75={a[3*len(a)//4]:.2f}" if a else "n=0"
print("read output raw chars:",raw_total,"json wrapper+escape overhead chars:",json_overhead)
print("blank-line ratio in reads:",q(blank_ratio))
print("reads >50% blank:",sum(1 for z in blank_ratio if z>.5),"of",len(blank_ratio))
print("consecutive-read line overlap (same session):",q(overlap))
print("reads where >80% lines already seen:",sum(1 for z in overlap if z>.8),"of",len(overlap))
print("exec->first read secs:",q(exec_to_read))
print("read->next read secs:",q(reread_gap))
print("propose description chars:",q(desc_len))
