"""Build data/pincodes.csv (one row per PIN) from India Post post-office level data.

Input : post-office-level CSV (CircleName,...,Pincode,...,District,StateName,Latitude,Longitude)
Output: pin,district,state,lat,lng,coord_source,n_offices

Method (the source has many wrong office coordinates):
 1. Keep only numeric points inside India's bbox (lat 6-37.5, lng 68-98).
 2. For each PIN, reference = median of all valid points sharing its 4-digit prefix
    (3-digit prefix if fewer than 5 points).
 3. Anchor = the PIN's own point closest to the reference. If the anchor is > 1.5 deg from the
    reference it is rejected as implausible.
 4. PIN coordinate = median of the PIN's points within 0.15 deg (~16 km) of the anchor.
 5. Sanity: a PIN whose point is > 3 deg from the median of its district's other PINs is treated as unresolved.
 6. PINs with no accepted point get the median of their district's resolved PINs
    (coord_source='district_centroid': approximate, good to district level only).
"""
import csv, sys, statistics as st, collections, math
src, out = sys.argv[1], sys.argv[2]
LAT=(6.0,37.5); LNG=(68.0,98.0)
def num(x):
    try: return float(x)
    except: return None
rows=list(csv.DictReader(open(src,encoding="utf-8",errors="replace",newline="")))
pts=collections.defaultdict(list); meta={}; n=collections.Counter()
for r in rows:
    pin=r["Pincode"].strip()
    if not (pin.isdigit() and len(pin)==6) or pin[0] in "09": continue  # 9xxxxx = Army Post Offices (not geographic)
    n[pin]+=1
    meta.setdefault(pin,(r["District"].strip().title(), r["StateName"].strip().title()))
    la,lo=num(r["Latitude"]),num(r["Longitude"])
    if la is None or lo is None: continue
    if LAT[0]<=la<=LAT[1] and LNG[0]<=lo<=LNG[1]: pts[pin].append((la,lo))
by4=collections.defaultdict(list); by3=collections.defaultdict(list)
for pin,p in pts.items(): by4[pin[:4]]+=p; by3[pin[:3]]+=p
def med(v): return (st.median(a for a,_ in v), st.median(b for _,b in v))
ref4={k:med(v) for k,v in by4.items() if len(v)>=5}; ref3={k:med(v) for k,v in by3.items()}
d=lambda p,q: max(abs(p[0]-q[0]),abs(p[1]-q[1]))
res={}; rej_pins=0
for pin,p in pts.items():
    ref=ref4.get(pin[:4]) or ref3[pin[:3]]
    anchor=min(p,key=lambda x:d(x,ref))
    if d(anchor,ref)>1.5: rej_pins+=1; continue
    keep=[x for x in p if d(x,anchor)<=0.15]
    res[pin]=(*med(keep),"offices")
dres=collections.defaultdict(list)
for pin,(a,b,_) in res.items(): dres[meta[pin]].append((a,b))
dmed={k:med(v) for k,v in dres.items() if len(v)>=3}
stray=0
for pin in list(res):
    m=dmed.get(meta[pin])
    if m and d(res[pin][:2],m)>3.0: del res[pin]; stray+=1
dres=collections.defaultdict(list)
for pin,(a,b,_) in res.items(): dres[meta[pin]].append((a,b))
fb=0; nofb=[]
for pin in meta:
    if pin in res: continue
    v=dres.get(meta[pin])
    if not v: nofb.append(pin); continue
    res[pin]=(*med(v),"district_centroid"); fb+=1
with open(out,"w",newline="") as f:
    w=csv.writer(f); w.writerow(["pin","district","state","lat","lng","coord_source","n_offices"])
    for pin in sorted(res):
        a,b,s=res[pin]; w.writerow([pin,meta[pin][0],meta[pin][1],round(a,5),round(b,5),s,n[pin]])
print(f"PINs total {len(meta)}; written {len(res)}; from offices {len(res)-fb}; district-centroid {fb}; "
      f"implausible-anchor PINs {rej_pins}; stray-vs-district {stray}; unresolvable {len(nofb)} {nofb[:10]}")
