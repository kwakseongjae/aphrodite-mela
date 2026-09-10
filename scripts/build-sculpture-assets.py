"""Deterministic Blender source -> GLB, transparent UI states and launch artwork.
Run: blender --background --factory-startup --python scripts/build-sculpture-assets.py -- preview|all
No external Blender add-ons or model-generation services required.
"""
import bpy, bmesh, math, json, sys, hashlib
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'lab/sculpture/source/venus-smk-KAS434.stl'
OUT = ROOT / 'lab/artifacts/aphrodite-sculpture-v1'
PUBLIC = ROOT / 'lab/brand/sculpture-v1'
OUT.mkdir(parents=True, exist_ok=True)
PUBLIC.mkdir(parents=True, exist_ok=True)
MODE = sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'preview'
if MODE == 'motion':
    bpy.ops.wm.open_mainfile(filepath=str(OUT/'aphrodite-studio.blend'))
    scene=bpy.context.scene;scene.cycles.samples=24
    scene.render.resolution_x=512;scene.render.resolution_y=512
    frames=OUT/'motion';frames.mkdir(exist_ok=True)
    for f in range(1,61):
        scene.frame_set(f)
        angle=.23+.12*math.sin(2*math.pi*(f-1)/60)
        scene.camera.location=(6*math.sin(angle),-6*math.cos(angle),1.8)
        scene.camera.rotation_euler=(Vector((.08,0,.52))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(frames/f'{f:03d}.png')
        bpy.ops.render.render(write_still=True)
    sys.exit(0)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 64 if MODE == 'all' else 24
scene.cycles.use_denoising = True
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.film_transparent = True
scene.world.color = (0.13, 0.13, 0.13)
scene.view_settings.view_transform = 'AgX'

def material(name, color, metal=0, rough=0.4):
    m=bpy.data.materials.new(name); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metal
    p.inputs['Roughness'].default_value=rough
    return m

marble=material('Warm ivory • marble', (.72,.68,.59), 0, .48)
n=marble.node_tree.nodes; l=marble.node_tree.links
noise=n.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value=145
bump=n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.16; bump.inputs['Distance'].default_value=.007
l.new(noise.outputs['Fac'],bump.inputs['Height']); l.new(bump.outputs['Normal'],n.get('Principled BSDF').inputs['Normal'])
gold=material('Champagne • brushed gold',(.64,.39,.105),1,.27)
ink=material('Obsidian',(.012,.015,.018),.25,.3)

def finish(o,name,mat):
    o.name=name; o.data.materials.append(mat)
    if o.type=='MESH':
        for p in o.data.polygons:p.use_smooth=True
    return o

def cube(name,loc,scale,mat,bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object
    o.scale=scale; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    finish(o,name,mat)
    if bevel:
        m=o.modifiers.new('Soft machined edges','BEVEL');m.width=bevel;m.segments=3
        o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return o

def curve(name,points,radius,mat):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.bevel_depth=radius;c.bevel_resolution=3
    s=c.splines.new('POLY');s.points.add(len(points)-1)
    for p,co in zip(s.points,points):p.co=(*co,1)
    o=bpy.data.objects.new(name,c);scene.collection.objects.link(o);c.materials.append(mat)
    return o

def aim(o,target):o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()

bpy.ops.wm.stl_import(filepath=str(SOURCE))
statue=finish(bpy.context.object,'Aphrodite • SMK KAS434 • derived bust',marble)
mins=Vector(tuple(min(v.co[i] for v in statue.data.vertices) for i in range(3)))
maxs=Vector(tuple(max(v.co[i] for v in statue.data.vertices) for i in range(3)))
center=(mins+maxs)/2
for v in statue.data.vertices:v.co=(v.co-Vector((center.x,center.y,mins.z)))*(3/(maxs.z-mins.z))
# Keep source scan intact on disk; derive a closed cropped museum bust.
bm=bmesh.new();bm.from_mesh(statue.data)
res=bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.00001,plane_co=(0,0,2.36),plane_no=(0,0,1),clear_inner=True)
boundary=[e for e in bm.edges if e.is_boundary]
if boundary:bmesh.ops.holes_fill(bm,edges=boundary,sides=0)
bm.to_mesh(statue.data);bm.free()
for v in statue.data.vertices:
    v.co.z-=2.36
    v.co*=1.5
cx=(min(v.co.x for v in statue.data.vertices)+max(v.co.x for v in statue.data.vertices))/2
cy=(min(v.co.y for v in statue.data.vertices)+max(v.co.y for v in statue.data.vertices))/2
for v in statue.data.vertices:v.co.x-=cx;v.co.y-=cy
statue['source']='SMK KAS434; Public Domain Mark 1.0; see source/smk-metadata.json'
statue['changes']='Cropped bust, normalized scale, new marble material. Not the AI concept mesh.'
base=cube('Obsidian display plinth',(0,0,-.09),(.86,.66,.15),ink)
trim=cube('Gold plinth trim',(0,0,-.018),(.87,.67,.012),gold,.003)

# Original parametric apple: lobed fruit with top dimple, curved stem and leaf.
apple_root=bpy.data.objects.new('Golden apple • pose control',None);scene.collection.objects.link(apple_root)
verts=[];faces=[];rings=48;segments=64
for i in range(rings+1):
    t=math.pi*i/rings
    for j in range(segments):
        p=2*math.pi*j/segments
        rad=.17*math.sin(t)*(1+.065*math.cos(5*p)*math.sin(t)**2)
        z=.18*math.cos(t)-.035*math.exp(-(t/.30)**2)+.012*math.exp(-((t-math.pi)/.25)**2)
        verts.append((rad*math.cos(p),rad*math.sin(p),z))
for i in range(rings):
    for j in range(segments):
        a=i*segments+j;b=i*segments+(j+1)%segments
        faces.append((a,b,b+segments,a+segments))
mesh=bpy.data.meshes.new('Lobed apple mesh');mesh.from_pydata(verts,[],faces);mesh.update()
apple=bpy.data.objects.new('Golden apple',mesh);scene.collection.objects.link(apple);finish(apple,'Golden apple',gold);apple.parent=apple_root
stem=curve('Apple stem',[(0,0,.14),(.008,0,.19),(.025,0,.235)],.012,gold);stem.parent=apple_root
leafverts=[]
for i in range(17):
    t=i/16;w=.034*math.sin(math.pi*t)
    leafverts.extend([(.01+.15*t,-w,.20+.065*math.sin(t*math.pi/2)),(.01+.15*t,w,.20+.065*math.sin(t*math.pi/2))])
lm=bpy.data.meshes.new('Leaf mesh');lm.from_pydata(leafverts,[],[(2*i,2*i+1,2*i+3,2*i+2) for i in range(16)]);lm.update()
leaf=bpy.data.objects.new('Golden leaf',lm);scene.collection.objects.link(leaf);finish(leaf,'Golden leaf',gold);leaf.parent=apple_root
sol=leaf.modifiers.new('Leaf thickness','SOLIDIFY');sol.thickness=.004
apple_root.location=(.53,-.28,.32)

props=[]
def prop(o):props.append(o);return o
frame=prop(curve('Selection frame',[(-.55,.18,-.01),(-.55,.18,1.15),(.57,.18,1.15),(.57,.18,-.01)],.005,gold))
for x in [-.55,.57]:
    for z in [-.01,1.15]:prop(cube('Selection handle',(x,.18,z),(.025,.018,.025),gold,.002))
blocks=[prop(cube('Assembly block '+str(i),(.44+(i%2)*.14,-.25,.03+(i//2)*.14),(.12,.12,.12),gold if i==2 else marble,.012)) for i in range(3)]
check=prop(curve('Success mark',[(.4,-.4,.1),(.49,-.4,.02),(.67,-.4,.25)],.013,gold))
review=prop(curve('Review pause left',[(.43,-.4,.02),(.43,-.4,.23)],.014,gold))
review2=prop(curve('Review pause right',[(.54,-.4,.02),(.54,-.4,.23)],.014,gold))
error=prop(curve('Recoverable error arc',[(.55+.12*math.cos(t),-.4,.14+.12*math.sin(t)) for t in [i*math.pi*1.65/40 for i in range(41)]],.01,gold))
export=prop(curve('Export arrow',[(.4,-.4,.1),(.6,-.4,.3),(.48,-.4,.3),(.6,-.4,.3),(.6,-.4,.18)],.011,gold))
vibe_orbit=prop(curve('Get Vibe orbit',[(.53+.24*math.cos(i*math.pi/32),-.24,.34+.24*math.sin(i*math.pi/32)) for i in range(65)],.008,gold))
vibe_spark=prop(curve('Get Vibe spark',[(.72,-.35,.68),(.745,-.35,.61),(.80,-.35,.59),(.745,-.35,.57),(.72,-.35,.50),(.695,-.35,.57),(.64,-.35,.59),(.695,-.35,.61),(.72,-.35,.68)],.006,gold))

for name,loc,power,size,color in [('Key',(-2,-3,4),380,3,(1,.91,.76)),('Fill',(3,-2,2),120,2,(.82,.88,1)),('Rim',(1,2,3),450,2,(1,.78,.45))]:
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
    o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;aim(o,(0,0,.5))
bpy.ops.object.camera_add(location=(2,-6,2.0));cam=bpy.context.object;cam.name='Orthographic asset camera';cam.data.type='ORTHO';cam.data.ortho_scale=1.65;aim(cam,(.08,0,.52));scene.camera=cam

STATES=['idle','welcome','assembling','get-vibe','awaiting-review','success','recoverable-error','export']
def state(name):
    for p in props:p.hide_render=True;p.hide_viewport=True
    apple_root.location=(.53,-.28,.32);apple_root.rotation_euler=(0,0,0)
    visible=[]
    if name in ['welcome','get-vibe']:visible=props[:5]
    if name=='assembling':visible=blocks;apple_root.location=(.55,-.22,.57)
    if name=='awaiting-review':visible=[review,review2];apple_root.location=(.54,-.24,.55)
    if name=='success':visible=[check];apple_root.location=(.53,-.28,.57)
    if name=='recoverable-error':visible=[error];apple_root.location=(.55,-.22,.49);apple_root.rotation_euler.y=.5
    if name=='export':visible=[export];apple_root.location=(.54,-.24,.56)
    if name=='get-vibe':
        apple_root.rotation_euler.z=-.45
        visible += [vibe_orbit,vibe_spark]
    for p in visible:p.hide_render=False;p.hide_viewport=False

def render(path,size=512):
    scene.render.resolution_x=size;scene.render.resolution_y=size
    scene.render.filepath=str(path);bpy.ops.render.render(write_still=True)

state('idle')
if MODE=='preview':
    for angle in [0,90,180,270]:
        t=math.radians(angle);cam.location=(5*math.sin(t),-5*math.cos(t),1.5);aim(cam,(.08,0,.52));render(OUT/f'angle-{angle}.png',384)
else:
    # Camera orientation is fixed across states; no sprite layout jitter.
    cam.location=(1.4,-6,1.8);aim(cam,(.08,0,.52))
    for name in STATES:
        state(name);render(PUBLIC/f'{name}.png',512)
    state('welcome');render(OUT/'hero-render.png',1200)
    state('idle')
    # Keyframes animate only the apple prop; stone is deliberately not face-rigged.
    for f,z,rot in [(1,.32,0),(30,.35,.15),(60,.32,0)]:
        apple_root.location.z=z;apple_root.rotation_euler.z=rot
        apple_root.keyframe_insert(data_path='location',frame=f);apple_root.keyframe_insert(data_path='rotation_euler',frame=f)
    scene.frame_end=60;scene.render.fps=30;scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'aphrodite-studio.blend'))
    bpy.ops.object.select_all(action='DESELECT')
    for o in [statue,base,trim,apple_root,apple,stem,leaf]:o.select_set(True)
    bpy.context.view_layer.objects.active=statue
    bpy.ops.export_scene.gltf(filepath=str(OUT/'aphrodite-studio.glb'),export_format='GLB',use_selection=True,export_animations=True)
    manifest={'version':1,'generator':'Blender '+bpy.app.version_string,'source':'SMK KAS434','sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'cell':{'width':512,'height':512},'atlas':{'file':'atlas.png','columns':4,'rows':2},'states':{s:{'file':s+'.png','x':(i%4)*512,'y':(i//4)*512,'width':512,'height':512,'loop':False} for i,s in enumerate(STATES)},'default':'idle','reducedMotion':'idle','agentControl':'Freeze decorative motion; state is never inferred from a sprite. Use text and accessible status.','reviewPolicy':'awaiting-review does not mean approved','modelNotes':'Derived cropped museum scan, not exact AI concept reconstruction. Procedural marble bump is Blender-only; GLB uses PBR fallback. Apple transform animation only; no facial or skeletal rig.'}
    (PUBLIC/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print('ASSET_BUILD_COMPLETE',json.dumps(manifest))
