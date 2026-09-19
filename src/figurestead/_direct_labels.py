"""Internal single-layer line-label planner and draw-time Matplotlib adapter."""
import math
import numpy as np
import matplotlib as mpl
from matplotlib.artist import Artist
from matplotlib.collections import PathCollection
from matplotlib.lines import Line2D
from matplotlib.text import Text
from matplotlib.transforms import IdentityTransform, Bbox
from matplotlib.colors import to_rgba
from matplotlib.path import Path
from matplotlib.textpath import TextToPath
from types import MethodType
from ._line_identity import IdentityLine

# Layout choices, not perception thresholds; pixels at the current renderer DPI.
GAP = 4.
PAD = 2.
CORRIDOR = 12.
MARKER_TEXT = 6.
LEADER_TOLERANCE = .75


def solve(entries, lo, hi, height, gap=GAP):
    """Screen-down ordered least-squares projection via bounded PAVA.

    Subtract i*s; all transformed coordinates share [lo+H/2,
    hi-H/2-(n-1)*s]. Clipping the isotonic solution to this common interval
    is the bounded projection, not a forward/backward heuristic.
    """
    ordered = sorted(entries, key=lambda e: (e['anchor'], e['rank']))
    n = len(ordered); separation = height + gap
    low, high = lo + height / 2, hi - height / 2 - (n - 1) * separation
    if not n or high < low:
        return None
    blocks = []
    for i, e in enumerate(ordered):
        blocks.append([e['anchor'] - i * separation, 1])
        while len(blocks) > 1 and blocks[-2][0] / blocks[-2][1] > blocks[-1][0] / blocks[-1][1]:
            b = blocks.pop(); blocks[-1][0] += b[0]; blocks[-1][1] += b[1]
    z = [min(high, max(low, total / count)) for total, count in blocks for _ in range(count)]
    return [{**e, 'center': z[i] + i * separation} for i, e in enumerate(ordered)]


def printable(label):
    return isinstance(label, str) and bool(label.strip()) and all(32 <= ord(c) <= 126 for c in label)


def contrast(ink, background):
    rgb = to_rgba(ink); bg = to_rgba(background)
    values = [rgb[i] * rgb[3] + bg[i] * (1-rgb[3]) for i in range(3)]
    def lum(c):
        return sum(w * (v / 12.92 if v <= .04045 else ((v+.055)/1.055)**2.4)
                   for w, v in zip((.2126,.7152,.0722), c))
    a, b = sorted((lum(values), lum(bg[:3])))
    return (b+.05)/(a+.05)


class DirectLabels(Artist):
    """Prepare before axes paint, from an unallocated baseline on every draw.

    Ephemeral label artists are drawn by a trailing axes artist, never appended
    on each redraw. No draw-event recursion or one-time layout allocation.
    """
    def __init__(self, ax, lines, labels, slots, theme, unsupported=False):
        super().__init__(); self.ax=ax; self.lines=lines; self.labels=labels; self.slots=slots; self.theme=theme
        self.unsupported=unsupported; self.export_unsupported=False; self.baseline=ax.get_position(original=True).frozen()
        self.installed=self.baseline; self.artists=[]; self.result={'status':'fallback','reason':'unsupported-layout'}
        self.clip_boxes={id(line):(line.get_clip_box(),getattr(line,"identity_points",line).get_clip_box()) for line in lines}
        self.legend=ax.get_legend(); self.set_zorder(-100); self.set_in_layout(False)
        self.overlay=_Overlay(self); ax.add_artist(self.overlay); ax.figure.add_artist(self)
        ax._figurestead_direct_labels=self
        # Restore the unallocated box BEFORE Figure.draw runs a layout engine.
        # The early planning artist then sees the engine's ordinary result.
        original_draw=ax.figure.draw
        def baseline_draw(figure, renderer):
            self.restore_baseline()
            return original_draw(renderer)
        ax.figure.draw=MethodType(baseline_draw, ax.figure)
        original_savefig=ax.figure.savefig
        def baseline_savefig(figure, *args, **kwargs):
            self.export_unsupported=kwargs.get('bbox_inches', mpl.rcParams['savefig.bbox']) is not None
            try:
                return original_savefig(*args, **kwargs)
            finally:
                self.export_unsupported=False
        ax.figure.savefig=MethodType(baseline_savefig, ax.figure)

    def position(self, box):
        in_layout=self.ax.get_in_layout()
        self.ax.set_position(box)
        self.ax.set_in_layout(in_layout)
        self.installed=box.frozen()

    def restore_baseline(self):
        current=self.ax.get_position(original=True).frozen()
        if not np.array_equal(current.bounds, self.installed.bounds):
            self.baseline=current
            self.unsupported=True
        self.position(self.baseline)

    def fail(self, reason):
        self.artists=[]; self.result={'status':'fallback','reason':reason}
        self.position(self.baseline)
        if self.legend is not None: self.legend.set_visible(True)

    def draw(self, renderer):
        ax=self.ax; fig=ax.figure
        current=ax.get_position(original=True).frozen()
        if not np.array_equal(current.bounds,self.installed.bounds):
            self.baseline=current; self.unsupported=True
        self.fail('unsupported-layout')
        if fig.get_layout_engine() is not None or len(fig.axes)!=1 or ax.get_aspect()!='auto' or self.unsupported or self.export_unsupported:
            return
        if ax.get_facecolor()[3] != 1 or fig.get_facecolor()[3] != 1:
            return
        if len(self.lines) not in (2,3): self.fail('unsupported-series-count'); return
        if len(set(self.slots))!=len(self.slots): self.fail('unsupported-geometry'); return
        if not all(printable(t) for t in self.labels): self.fail('unsupported-text'); return
        if ax.get_xscale()!='linear' or ax.get_yscale()!='linear': self.fail('unsupported-geometry'); return
        xd,yd=ax.get_xlim(),ax.get_ylim()
        if xd[0]>=xd[1] or yd[0]>=yd[1]: self.fail('unsupported-geometry'); return
        if self.legend is None: return
        # Check the whole authored figure before inspecting any terminal marker.
        for line in self.lines:
            xy=line.get_xydata()
            if (np.any(xy[:,0] < xd[0]) or np.any(xy[:,0] > xd[1])
                or np.any(xy[:,1] < yd[0]) or np.any(xy[:,1] > yd[1])):
                self.fail('outside-common-admission-profile'); return
        scale=renderer.points_to_pixels(1); base=ax.bbox.frozen(); figbox=fig.bbox
        entries=[]; marker_half=0.; text_width=0.; height=0.
        for line,label,rank in zip(self.lines,self.labels,self.slots):
            points=getattr(line,'identity_points',None); xy=line.get_xydata()
            if (not isinstance(line,IdentityLine) or points is None or not line.get_visible() or not points.get_visible()
                or line.get_drawstyle()!='default' or line.get_transform()!=ax.transData
                or points.get_offset_transform()!=ax.transData or not line.get_clip_on() or not points.get_clip_on()
                or line.get_clip_path() is not None or points.get_clip_path() is not None
                or any(b is not original for b,original in zip((line.get_clip_box(),points.get_clip_box()), self.clip_boxes[id(line)]))
                or len(xy)<2 or not np.isfinite(xy).all() or not np.all(np.diff(xy[:,0])>0)
                or not np.array_equal(points.get_offsets(),xy) or len(points.get_paths())!=1
                or points.get_alpha()!=1 or len(points.get_sizes())!=1
                or len(points.get_edgecolors())!=1 or len(points.get_linewidths())!=1
                or len(points.get_facecolors())!=0 or not isinstance(points.get_transform(),IdentityTransform)
                or points.get_joinstyle() not in (None, 'round')
                or line.get_animated() or points.get_animated()):
                self.fail('unsupported-geometry'); return
            if entries and not np.array_equal(xy[:,0],self.lines[0].get_xydata()[:,0]): self.fail('unsupported-geometry'); return
            x,y=xy[-1]
            ink_width=float(max(points.get_linewidths())); inks=list(points.get_edgecolors())
            for effect in points.get_path_effects() or []:
                gc=getattr(effect,'_gc',{})
                if type(effect).__name__ not in ('Stroke','Normal') or gc.get('joinstyle', 'round') != 'round': self.fail('unsupported-geometry'); return
                ink_width=max(ink_width,gc.get('linewidth',ink_width))
                if 'foreground' in gc: inks.append(to_rgba(gc['foreground'],gc.get('alpha',1)))
            bounds=points.get_paths()[0].get_extents(); size=math.sqrt(points.get_sizes()[0])*scale
            half=max(abs(bounds.x0),abs(bounds.x1),abs(bounds.y0),abs(bounds.y1))*size+ink_width*scale/2
            anchor=ax.transData.transform(xy[-1]); ay=figbox.height-anchor[1]
            if not(base.x0+half<=anchor[0]<=base.x1-half and base.y0+half<=anchor[1]<=base.y1-half):
                self.fail('terminal-marker-clipped'); return
            try:
                # Legend.prop is resolved even when automatic underscore filtering
                # leaves no text rows; it is also the font source for those rows.
                text=Text(0,0,label,fontproperties=self.legend.prop.copy(),
                          color=self.theme.label,ha='left',va='baseline',parse_math=False,usetex=False,transform=IdentityTransform())
                text.set_figure(fig); box=text.get_window_extent(renderer)
                # Include glyph overhang from actual font outlines, explicitly literal.
                text_path=TextToPath()
                vertices,codes=text_path.get_text_path(text.get_fontproperties(), label, ismath=False)
                if len(vertices):
                    ink=Path(vertices,codes).get_extents()
                    factor=scale*text.get_fontsize()/text_path.FONT_SCALE
                    ink=Bbox.from_extents(*(np.array(ink.extents)*factor))
                    box=Bbox.union([box,ink])
                width,h,descent=renderer.get_text_width_height_descent(label,text.get_fontproperties(),ismath=False)
                if not all(math.isfinite(v) for v in (box.x0,box.x1,box.y0,box.y1,width,h,descent)):
                    self.fail('unsupported-layout'); return
            except (AttributeError, TypeError, ValueError, RuntimeError, NotImplementedError):
                self.fail('unsupported-layout'); return
            if any(contrast(c,fig.get_facecolor())<3 for c in inks) or contrast(self.theme.label,fig.get_facecolor())<3:
                self.fail('ink-contrast'); return
            entries.append({'anchor':ay,'rank':rank,'text':text,'box':box,'half':half,'points':points,'xy':xy[-1].copy()})
            marker_half=max(marker_half,half);text_width=max(text_width,box.width);height=max(height,box.height,2*half)
        unit=fig.dpi/96; pad=PAD*unit; corridor=CORRIDOR*unit
        H=height+2*pad; required=corridor+2*marker_half+MARKER_TEXT*unit+text_width+2*pad
        available=figbox.x1-base.x1-pad; shrink=max(0.,required-available)
        # Matplotlib has no product minimum width: v1 uses the same 160px layout floor as browser.
        if shrink>.25*base.width or base.width-shrink<160*unit: self.fail('horizontal-capacity'); return
        plan=solve(entries,figbox.height-base.y1,figbox.height-base.y0,H,GAP*unit)
        if plan is None: self.fail('vertical-capacity'); return
        box=Bbox.from_bounds(self.baseline.x0,self.baseline.y0,self.baseline.width-shrink/figbox.width,self.baseline.height)
        self.position(box)
        marker_x=ax.bbox.x1+corridor+marker_half+pad; text_x=marker_x+marker_half+MARKER_TEXT*unit
        colors=[self.theme.secondary,self.theme.label]
        leader=next((c for c in colors if all(contrast(c,b)>=3 for b in (ax.get_facecolor(),fig.get_facecolor()))),None)
        # Only annotations intersecting the reserved association corridor/rows interfere.
        min_x=min(ax.transData.transform(e['xy'])[0] for e in plan)
        low=figbox.height-max(max(e['anchor'],e['center']+H/2) for e in plan)
        high=figbox.height-min(min(e['anchor'],e['center']-H/2) for e in plan)
        corridor_box=Bbox.from_extents(min_x,low,figbox.x1,high)
        if any(t.get_visible() and corridor_box.overlaps(t.get_window_extent(renderer)) for t in ax.texts):
            self.fail('unsupported-layout');return
        artists=[]; records=[]
        for e in plan:
            y=figbox.height-e['center']; anchor=ax.transData.transform(e['xy']); half=e['half']
            if not(ax.bbox.x0+half<=anchor[0]<=ax.bbox.x1-half and ax.bbox.y0+half<=anchor[1]<=ax.bbox.y1-half):
                self.fail('terminal-marker-clipped'); return
            if abs(e['center']-e['anchor'])>LEADER_TOLERANCE*unit:
                if leader is None: self.fail('ink-contrast'); return
                # Horizontal clearance out of the terminal marker, then reserved corridor.
                artists.append(Line2D([anchor[0]+marker_half+pad,marker_x-marker_half-pad-unit],[anchor[1],y],
                                      linewidth=.7,color=leader,alpha=1,transform=IdentityTransform(),clip_on=False))
            points=e['points']; marker=PathCollection(points.get_paths(),sizes=points.get_sizes(),offsets=[(marker_x,y)],
                offset_transform=IdentityTransform(),facecolors='none',edgecolors=points.get_edgecolors(),
                linewidths=points.get_linewidths(),alpha=points.get_alpha(),transform=IdentityTransform(),clip_on=False)
            marker.set_path_effects(points.get_path_effects()); artists.append(marker)
            text=e['text']; b=e['box'];text.set_position((text_x-b.x0,y-(b.y0+b.y1)/2));artists.append(text)
            records.append({'rank':e['rank'],'anchor':e['anchor'],'center':e['center'],'markerPath':points.get_paths()[0].vertices.tolist(),
                            'leader': None if abs(e['center']-e['anchor'])<=LEADER_TOLERANCE*unit else {'x1':float(anchor[0]+marker_half+pad),'y1':float(e['anchor']),'x2':marker_x-marker_half-pad-unit,'y2':e['center'],'color':leader},
                            'box':[marker_x-marker_half-pad,e['center']-H/2,text_x+text_width+pad,e['center']+H/2]})
        for a in artists:a.set_figure(fig)
        self.artists=artists;self.legend.set_visible(False)
        self.result={'status':'placed','reason':None,'entries':records,'shrink':shrink,'baseline':list(base.bounds),'height':H}


class _Overlay(Artist):
    def __init__(self, owner):
        super().__init__();self.owner=owner;self.set_zorder(100);self.set_clip_on(False);self.set_in_layout(False)
    def draw(self,renderer):
        for a in self.owner.artists:a.draw(renderer)
