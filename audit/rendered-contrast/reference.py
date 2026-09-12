"""Independent regression oracle. No Figurestead imports; not production code.

Regenerate deliberately with: python3 audit/rendered-contrast/reference.py
The five source contexts and two native float32-opacity variants come from actual Python polyline and Canvas/SVG segment observations; this is not a
runtime-to-context resolver. Renderer fact checks live alongside this fixture.
"""
from pathlib import Path
import hashlib,json,math,struct
ROOT=Path(__file__).resolve().parents[2]
CONTEXTS=[('python-line-polyline','field',.88),('canvas-line-segment-panel','panel',.78),
          ('canvas-line-segment-field','field',.78),('svg-line-segment-panel','panel',1.),('svg-line-segment-field','field',1.),
          ('canvas-line-segment-panel-f32-opacity','panel',struct.unpack('f',struct.pack('f',.78))[0]),
          ('canvas-line-segment-field-f32-opacity','field',struct.unpack('f',struct.pack('f',.78))[0])]
def expected(ink,paper,alpha):
    # Independently use 0..255 channels for compositing, then normalize once.
    a=[int(ink[i:i+2],16) for i in (1,3,5)]
    b=[int(paper[i:i+2],16) for i in (1,3,5)]
    mixed=[(x*alpha+y*(1-alpha))/255 for x,y in zip(a,b)]
    def light(v):
        return math.fsum(w*(c/12.92 if c<=.04045 else math.pow((c+.055)/1.055,2.4))
                         for w,c in zip((.2126,.7152,.0722),v))
    x=light(mixed)+.05;y=light([v/255 for v in b])+.05
    ratio=max(x/y,y/x)
    return {'effectiveColor':mixed,'ratio':ratio,'passes':ratio>=3}
def fixture():
    assert expected('#000000','#FFFFFF',1)['ratio']==21
    assert expected('#000000','#FFFFFF',0)['ratio']==1
    assert expected('#FFFFFF','#000000',.5)['effectiveColor']==[.5]*3
    rows=[];inputs=[]
    for p in sorted((ROOT/'src/figurestead/themes').glob('*.json')):
        b=p.read_bytes();t=json.loads(b)['themes'][p.stem]
        inputs.append({'path':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(b).hexdigest()})
        assert not t.get('seriesEdges')
        for name,surface,alpha in CONTEXTS:
            for i,color in enumerate(t['series']):
                rows.append({'theme':p.stem,'context':name,'surface':surface,'substrate':t[surface],
                             'opacity':alpha,'color':color,'index':i,**expected(color,t[surface],alpha)})
    return {'method':'Independent encoded-sRGB source-over, relative luminance; full-coverage edge-free ink; floor3',
            'inputs':inputs,'rows':rows}
if __name__=='__main__':
    (Path(__file__).parent/'expected.json').write_text(json.dumps(fixture(),indent=2)+'\n')
