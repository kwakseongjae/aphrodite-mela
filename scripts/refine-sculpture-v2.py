"""Refine the real v1 Blender scene, preserving v1. No AI image overlays.
blender --background --factory-startup --python scripts/refine-sculpture-v2.py -- preview|all
"""
import bpy, math, json, sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'lab/artifacts/aphrodite-sculpture-v2'
PUB=ROOT/'public/brand/sculpture-v2'
MODE=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'preview'
OUT.mkdir(parents=True,exist_ok=True);PUB.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'lab/sculpture/models/aphrodite-studio.blend'))
scene=bpy.context.scene;scene.frame_set(1)
scene.cycles.samples=128 if MODE=='all' else 48
scene.cycles.use_denoising=True
scene.render.film_transparent=True
scene.render.image_settings.color_mode='RGBA'
scene.render.image_settings.color_depth='8'
scene.view_settings.look='AgX - Medium High Contrast'
statue=next(o for o in bpy.data.objects if 'derived bust' in o.name)
marble=bpy.data.materials['Warm ivory • marble']
nodes=marble.node_tree.nodes
bsdf=nodes.get('Principled BSDF')
bsdf.inputs['Base Color'].default_value=(.78,.755,.70,1)
bsdf.inputs['Roughness'].default_value=.38
# v1's uniform bump obscured the scanned eyelid/lip detail. Restore clean stone.
for n in nodes:
    if n.type=='BUMP':n.inputs['Strength'].default_value=.07;n.inputs['Distance'].default_value=.0012
    if n.type=='TEX_NOISE':n.inputs['Scale'].default_value=230
gold=bpy.data.materials['Champagne • brushed gold']
g=gold.node_tree.nodes.get('Principled BSDF');g.inputs['Base Color'].default_value=(.72,.47,.17,1);g.inputs['Roughness'].default_value=.3
ink=bpy.data.materials['Obsidian']
def mat(name,color,metal=0,rough=.3):
    m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    return m
acetate=mat('Sunglasses • piano black acetate',(.008,.009,.013),.12,.2)
lensmat=mat('Sunglasses • smoke polished lenses',(.017,.023,.031),.42,.12)
def curve(name,points,radius,material,parent=None):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=radius;c.bevel_resolution=4
    s=c.splines.new('POLY');s.points.add(len(points)-1)
    for p,co in zip(s.points,points):p.co=(*co,1)
    c.materials.append(material);o=bpy.data.objects.new(name,c);scene.collection.objects.link(o);o.parent=parent;return o

# Accessory root is editable independently from the museum scan.
glasses=bpy.data.objects.new('Sunglasses • fitted accessory root',None);scene.collection.objects.link(glasses)
glasses.location=(.104,-.431,.600)
glasses.rotation_euler=(0,math.radians(-2),math.radians(45))
accessories=[]
def accessory(o):accessories.append(o);return o
for side in [-1,1]:
    cx=side*.088
    points=[]
    for i in range(65):
        a=2*math.pi*i/64
        x=cx+.073*math.copysign(abs(math.cos(a))**.52,math.cos(a))
        z=.030*math.copysign(abs(math.sin(a))**.65,math.sin(a))
        points.append((x,-.013,z))
    accessory(curve('Acetate rim '+str(side),points,.007,acetate,glasses))
    mesh=bpy.data.meshes.new('Lens mesh '+str(side));mesh.from_pydata(points[:-1],[],[tuple(range(64))]);mesh.update()
    ob=bpy.data.objects.new('Smoke lens '+str(side),mesh);scene.collection.objects.link(ob);ob.parent=glasses;ob.data.materials.append(lensmat)
    solid=ob.modifiers.new('Optical thickness','SOLIDIFY');solid.thickness=.005;accessory(ob)
    accessory(curve('Temple arm '+str(side),[(side*.164,-.01,.01),(side*.175,.05,.008),(side*.168,.17,-.01),(side*.156,.22,-.025)],.006,acetate,glasses))
    accessory(curve('Gold hinge '+str(side),[(side*.158,-.02,.015),(side*.173,.008,.015)],.005,gold,glasses))
accessory(curve('Bridge',[(-.016,-.015,.005),(0,-.027,.012),(.016,-.015,.005)],.007,acetate,glasses))

# Subtle engraved-style metal lettering on the plinth, not floating screen text.
font=bpy.data.curves.new('Plinth wordmark','FONT');font.body='A P H R O D I T E';font.align_x='CENTER';font.size=.035;font.extrude=.0003;font.materials.append(gold)
word=bpy.data.objects.new('Plinth • APHRODITE',font);scene.collection.objects.link(word);word.location=(0,-.333,-.106);word.rotation_euler.x=math.pi/2

apple=bpy.data.objects['Golden apple'];apple_root=bpy.data.objects['Golden apple • pose control']
apple_root.animation_data_clear()
# Curved gold leaf gets a readable central vein and fine side veins.
veins=[]
veins.append(curve('Apple leaf • midrib',[(.01+.15*t,0,.204+.065*math.sin(t*math.pi/2)) for t in [i/20 for i in range(21)]],.0017,gold,apple_root))
for t in [.25,.4,.55,.7]:
    for sign in [-1,1]:veins.append(curve('Apple leaf • vein',[(.01+.15*t,0,.205+.065*math.sin(t*math.pi/2)),(.01+.15*(t+.1),sign*.026*math.sin(math.pi*(t+.1)),.205+.065*math.sin((t+.1)*math.pi/2))],.0008,gold,apple_root))

def aim(o,target):o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
for name,power,size,loc in [('Key',240,1.5,(-2,-3,3)),('Fill',75,2.5,(3,-2,1.7)),('Rim',310,1.4,(1,2,2.8))]:
    o=bpy.data.objects[name];o.data.energy=power;o.data.size=size;o.location=loc;aim(o,(0,0,.55))
cam=scene.camera;cam.location=(1.4,-6,1.65);aim(cam,(.08,0,.52))
STATES=['idle','welcome','assembling','get-vibe','awaiting-review','success','recoverable-error','export']
props=[o for o in scene.objects if any(o.name.startswith(p) for p in ['Selection','Assembly block','Success mark','Review pause','Recoverable error arc','Export arrow','Get Vibe'])]
def state(name):
    for o in props+accessories:o.hide_render=True;o.hide_viewport=True
    apple_root.location=(.53,-.28,.32);apple_root.rotation_euler=(0,0,0)
    prefixes=[]
    if name=='welcome':prefixes=['Selection']
    if name=='assembling':prefixes=['Assembly block'];apple_root.location.z=.57
    if name=='get-vibe':prefixes=['Get Vibe'];apple_root.rotation_euler.z=-.45
    if name=='awaiting-review':prefixes=['Review pause'];apple_root.location.z=.55
    if name=='success':prefixes=['Success mark'];apple_root.location.z=.57
    if name=='recoverable-error':prefixes=['Recoverable error arc'];apple_root.location.z=.49;apple_root.rotation_euler.y=.5
    if name=='export':prefixes=['Export arrow'];apple_root.location.z=.56
    for o in props:
        if any(o.name.startswith(p) for p in prefixes):o.hide_render=False;o.hide_viewport=False
    if name in ['get-vibe','success']:
        for o in accessories:o.hide_render=False;o.hide_viewport=False
def render(path,size):
    scene.render.resolution_x=size;scene.render.resolution_y=size;scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)
if MODE=='preview':
    state('get-vibe');render(OUT/'fit-preview.png',900)
else:
    for s in STATES:state(s);render(PUB/(s+'.png'),512)
    state('idle');render(OUT/'classic-detail.png',1600)
    state('get-vibe');render(OUT/'vibe-detail.png',1600)
    # Save the fun variant visibly fitted; retain all state props in editable source.
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'aphrodite-detail-v2.blend'))
    for variant,visible in [('classic',False),('vibe',True)]:
        bpy.ops.object.select_all(action='DESELECT')
        for o in [statue,apple,apple_root,bpy.data.objects['Apple stem'],bpy.data.objects['Golden leaf'],bpy.data.objects['Obsidian display plinth'],bpy.data.objects['Gold plinth trim'],word]+veins+(accessories if visible else []):o.select_set(True)
        if visible:glasses.select_set(True)
        bpy.context.view_layer.objects.active=statue
        bpy.ops.export_scene.gltf(filepath=str(OUT/f'aphrodite-{variant}-v2.glb'),export_format='GLB',use_selection=True,export_animations=False)
    m=json.loads((ROOT/'lab/brand/sculpture-v1/manifest.json').read_text());m['version']=2;m['sunglassesStates']=['get-vibe','success'];m['modelNotes']='Original SMK scan anatomy retained; refined stone microtexture, studio lighting, leaf veins, plinth lettering and fitted 3D sunglasses. Static GLB variants; no face rig, no recovered scan details. Blender bump uses PBR fallback in GLB.'
    (PUB/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n')
    print('DETAIL_V2_COMPLETE')
