import json,glob,collections,re,sys,os
calls=collections.Counter(); out_chars=collections.defaultdict(list); lines_arg=collections.Counter()
errors=collections.Counter(); sessions=set(); seqs=collections.Counter(); pending={}
reads_after_exec=[]; list_per_session=collections.Counter(); err_samples=[]
for f in glob.glob(os.path.expanduser("~/.claude/projects/*/*.jsonl")):
    seq=[]
    for l in open(f,errors="ignore"):
        try:d=json.loads(l)
        except:continue
        c=d.get("message",{}).get("content")
        if not isinstance(c,list):continue
        for x in c:
            if x.get("type")=="tool_use" and x.get("name","").startswith("mcp__iterm2__"):
                n=x["name"][13:]; calls[n]+=1; sessions.add(f); pending[x["id"]]=n; seq.append(n)
                if n=="read_session_output": lines_arg[x.get("input",{}).get("lines",20)]+=1
                if n=="list_iterm_sessions": list_per_session[f]+=1
            if x.get("type")=="tool_result" and x.get("tool_use_id") in pending:
                n=pending[x["tool_use_id"]]; cc=x.get("content")
                t=cc if isinstance(cc,str) else " ".join(y.get("text","") for y in cc or [] if isinstance(y,dict))
                out_chars[n].append(len(t))
                if x.get("is_error") or '"error"' in t[:30]:
                    errors[n]+=1
                    if len(err_samples)<12: err_samples.append((n,t[:200].replace("\n"," ")))
    for a,b in zip(seq,seq[1:]): seqs[(a,b)]+=1
print("sessions using iterm2:",len(sessions))
for n,k in calls.most_common():
    o=out_chars[n]; o.sort()
    print(f"{n:25} calls={k:4} errs={errors[n]:3} result_chars avg={sum(o)//max(len(o),1):6} p50={o[len(o)//2] if o else 0:6} max={o[-1] if o else 0:7} total={sum(o)}")
print("read lines arg:",lines_arg.most_common(12))
print("list calls per session (top):",sorted(list_per_session.values(),reverse=True)[:10])
print("top transitions:"); [print("  ",a,"->",b,k) for (a,b),k in seqs.most_common(12)]
print("error samples:"); [print("  ",s) for s in err_samples]
