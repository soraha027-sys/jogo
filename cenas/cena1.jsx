var comp=app.project.items.addComp("Main",1920,1080,1,3.950000,60);comp.motionBlur=true;comp.bgColor=[1,1,1];
try{comp.shutterAngle=180;comp.shutterPhase=-90;comp.motionBlurSamplesPerFrame=12;comp.motionBlurAdaptiveSampleLimit=48;}catch(e){}
var s=comp.layers.addSolid([1,1,1],"Wall",7000,5000,1,3.950000);s.threeDLayer=true;s.motionBlur=true;
s.property("Transform").property("Position").setValue([2640,1540,0]);
var g=s.property("Effects").addProperty("Grid");g.property("Anchor").setValue([860,960]);g.property("Size From").setValue(3);g.property("Width").setValue(440);g.property("Height").setValue(440);g.property("Border").setValue(21);g.property("Color").setValue([0,0,0]);
var go=g.property("Opacity");go.setValueAtTime(0.25,0);go.setValueAtTime(0.6,100);
var t=comp.layers.addText("eu");t.threeDLayer=true;t.motionBlur=true;
var td=t.property("Source Text").value;td.font="Montserrat-Bold";td.fontFamily="Montserrat";td.fontStyle="Bold";td.fontSize=165;td.fillColor=[0.745,0.745,0.745];td.applyStroke=false;td.justification=ParagraphJustification.LEFT_JUSTIFY;t.property("Source Text").setValue(td);
t.property("Transform").property("Position").setValue([1800.000000,1800.000000,-170.000000]);
var a=t.property("Text").property("Animators").addProperty("ADBE Text Animator");a.property("Properties").addProperty("ADBE Text Fill Color").setValue([1.0, 0.5411764705882353, 0.0]);
var sl=a.property("Selectors").addProperty("ADBE Text Selector");var e=sl.property("End");e.setValueAtTime(0.500000,0);e.setValueAtTime(0.650000,100);
var op2=t.property("Transform").property("Opacity");op2.setValueAtTime(0.25,0);op2.setValueAtTime(0.6,100);
var t=comp.layers.addText("fiz");t.threeDLayer=true;t.motionBlur=true;
var td=t.property("Source Text").value;td.font="Montserrat-Bold";td.fontFamily="Montserrat";td.fontStyle="Bold";td.fontSize=165;td.fillColor=[0.745,0.745,0.745];td.applyStroke=false;td.justification=ParagraphJustification.LEFT_JUSTIFY;t.property("Source Text").setValue(td);
t.property("Transform").property("Position").setValue([2047.828125,1800.000000,-170.000000]);
var a=t.property("Text").property("Animators").addProperty("ADBE Text Animator");a.property("Properties").addProperty("ADBE Text Fill Color").setValue([1.0, 0.5725490196078431, 0.0]);
var sl=a.property("Selectors").addProperty("ADBE Text Selector");var e=sl.property("End");e.setValueAtTime(0.750000,0);e.setValueAtTime(0.945000,100);
var op2=t.property("Transform").property("Opacity");op2.setValueAtTime(0.25,0);op2.setValueAtTime(0.6,100);
var t=comp.layers.addText("tudo");t.threeDLayer=true;t.motionBlur=true;
var td=t.property("Source Text").value;td.font="Montserrat-Bold";td.fontFamily="Montserrat";td.fontStyle="Bold";td.fontSize=165;td.fillColor=[0.745,0.745,0.745];td.applyStroke=false;td.justification=ParagraphJustification.LEFT_JUSTIFY;t.property("Source Text").setValue(td);
t.property("Transform").property("Position").setValue([2272.734375,1800.000000,-170.000000]);
var a=t.property("Text").property("Animators").addProperty("ADBE Text Animator");a.property("Properties").addProperty("ADBE Text Fill Color").setValue([1.0, 0.7215686274509804, 0.0]);
var sl=a.property("Selectors").addProperty("ADBE Text Selector");var e=sl.property("End");e.setValueAtTime(1.080000,0);e.setValueAtTime(1.320000,100);
var op2=t.property("Transform").property("Opacity");op2.setValueAtTime(0.25,0);op2.setValueAtTime(0.6,100);
var t=comp.layers.addText("isso");t.threeDLayer=true;t.motionBlur=true;
var td=t.property("Source Text").value;td.font="Montserrat-Bold";td.fontFamily="Montserrat";td.fontStyle="Bold";td.fontSize=165;td.fillColor=[0.745,0.745,0.745];td.applyStroke=false;td.justification=ParagraphJustification.LEFT_JUSTIFY;t.property("Source Text").setValue(td);
t.property("Transform").property("Position").setValue([1800.000000,2055.000000,-200.000000]);
var a=t.property("Text").property("Animators").addProperty("ADBE Text Animator");a.property("Properties").addProperty("ADBE Text Fill Color").setValue([1.0, 0.10196078431372549, 0.10196078431372549]);
var sl=a.property("Selectors").addProperty("ADBE Text Selector");var e=sl.property("End");e.setValueAtTime(2.080000,0);e.setValueAtTime(2.320000,100);
var op=t.property("Transform").property("Opacity");op.setValueAtTime(1.280000,0);op.setValueAtTime(1.480000,100);

var t=comp.layers.addText("sozinho");t.threeDLayer=true;t.motionBlur=true;
var td=t.property("Source Text").value;td.font="Montserrat-Bold";td.fontFamily="Montserrat";td.fontStyle="Bold";td.fontSize=165;td.fillColor=[0.745,0.745,0.745];td.applyStroke=false;td.justification=ParagraphJustification.LEFT_JUSTIFY;t.property("Source Text").setValue(td);
t.property("Transform").property("Position").setValue([1780.000000,2320.000000,-230.000000]);
var a=t.property("Text").property("Animators").addProperty("ADBE Text Animator");a.property("Properties").addProperty("ADBE Text Fill Color").setValue([0.12156862745098039, 0.2, 1.0]);
var sl=a.property("Selectors").addProperty("ADBE Text Selector");var e=sl.property("End");e.setValueAtTime(2.580000,0);e.setValueAtTime(2.955000,100);
var op=t.property("Transform").property("Opacity");op.setValueAtTime(1.780000,0);op.setValueAtTime(1.980000,100);

var t=comp.layers.addText("mano");t.threeDLayer=true;t.motionBlur=true;
var td=t.property("Source Text").value;td.font="Montserrat-Bold";td.fontFamily="Montserrat";td.fontStyle="Bold";td.fontSize=165;td.fillColor=[0.745,0.745,0.745];td.applyStroke=false;td.justification=ParagraphJustification.LEFT_JUSTIFY;t.property("Source Text").setValue(td);
t.property("Transform").property("Position").setValue([2470.187500,2320.000000,-230.000000]);
var a=t.property("Text").property("Animators").addProperty("ADBE Text Animator");a.property("Properties").addProperty("ADBE Text Fill Color").setValue([0.8784313725490196, 0.06274509803921569, 0.9333333333333333]);
var sl=a.property("Selectors").addProperty("ADBE Text Selector");var e=sl.property("End");e.setValueAtTime(3.080000,0);e.setValueAtTime(3.320000,100);
var op=t.property("Transform").property("Opacity");op.setValueAtTime(2.280000,0);op.setValueAtTime(2.480000,100);

var c=comp.layers.addCamera("Cam",[960,540]);var co=c.property("Camera Options");co.property("Zoom").setValue(1500.000000);
co.property("Depth of Field").setValue(1);co.property("Aperture").setValue(60);co.property("Blur Level").setValue(100);
var tt=[0.0, 0.375, 0.625, 0.875, 1.125, 1.375, 1.625, 1.875, 2.125, 2.375, 2.625, 2.875, 3.125, 3.375, 3.78, 3.95];
var pp=c.property("Transform").property("Position");pp.setValuesAtTimes(tt,[[1279.2272589047056, 1483.6202831743383, -1304.9197472694648], [1588.1945539755002, 1593.2565593585566, -1265.3847178879864], [1795.7135337444074, 1684.894158814586, -1093.6556400757017], [1783.2078051711626, 1859.6636033700365, -1160.991372818386], [2180.5029502910784, 1845.269792652718, -1116.0178125588086], [2429.1766874811715, 1819.0981374603982, -1092.2620118648601], [2514.591363429326, 1845.0375707700746, -1106.2151888324129], [2535.5976713014074, 1816.8069979637955, -1107.3572142091168], [2453.5098264310045, 1912.9752101287268, -1135.6448718350641], [2225.104642151109, 1977.1742456410273, -1104.390407163939], [2138.046345456743, 2084.0818118770553, -1083.3610084553839], [2337.5470732315453, 2243.560663494937, -978.0590873173697], [2572.6597068544925, 2297.4867349252186, -881.1809382431261], [2662.0257391375762, 2322.942215070241, -854.6192668869348], [2687.275008536005, 2321.7713479961285, -829.6344962114574], [2996.957347904343, 2327.2533609664397, -773.7846722219899]]);
for(var i=1;i<=pp.numKeys;i++){var ein=[],eout=[];for(var d=0;d<3;d++){ein.push(new KeyframeEase(0,i==pp.numKeys?10:80));eout.push(new KeyframeEase(0,i==pp.numKeys-1?85:12));}try{pp.setTemporalEaseAtKey(i,ein,eout);}catch(e){writeLn("ease err "+e)}}
try{for(var i=1;i<=pp.numKeys;i++){pp.setSpatialContinuousAtKey(i,true);pp.setSpatialAutoBezierAtKey(i,true);}}catch(e){writeLn("sp "+e)}
var pp=c.property("Transform").property("Point of Interest");pp.setValuesAtTimes(tt,[[2231.538000254325, 1248.968585613992, -170], [2272.6668927335477, 1411.7264276715148, -170], [2168.894635975549, 1597.7384160669278, -170], [2183.594309366176, 1784.9245243584737, -170], [2381.5852438071743, 1811.4960861664267, -170], [2509.864158319958, 1802.9385018703208, -170], [2563.656322407086, 1845.0375707700746, -170], [2535.5976713014074, 1833.1686289987488, -170], [2404.474756500563, 1945.6934882873213, -200], [2145.9807341226697, 2024.7523876800672, -200], [2063.3869313218465, 2113.995666193485, -230], [2285.2376861100697, 2256.6499683229, -230], [2538.532759969723, 2308.868739123447, -230], [2640.2135536985134, 2322.942215070241, -230], [2666.3353105145043, 2321.7713479961285, -230], [3250.5283049487625, 2327.2533609664397, -230]]);
for(var i=1;i<=pp.numKeys;i++){var ein=[],eout=[];for(var d=0;d<3;d++){ein.push(new KeyframeEase(0,i==pp.numKeys?10:80));eout.push(new KeyframeEase(0,i==pp.numKeys-1?85:12));}try{pp.setTemporalEaseAtKey(i,ein,eout);}catch(e){writeLn("ease err "+e)}}
try{for(var i=1;i<=pp.numKeys;i++){pp.setSpatialContinuousAtKey(i,true);pp.setSpatialAutoBezierAtKey(i,true);}}catch(e){writeLn("sp "+e)}
var pp=c.property("Transform").property("Z Rotation");pp.setValuesAtTimes(tt,[12, 11, 9, 5, 2, 1, 1, 2, 3, 6, 4, 4, 3, 2, 2, 4]);
for(var i=1;i<=pp.numKeys;i++){var ein=[],eout=[];for(var d=0;d<1;d++){ein.push(new KeyframeEase(0,i==pp.numKeys?10:80));eout.push(new KeyframeEase(0,i==pp.numKeys-1?85:12));}try{pp.setTemporalEaseAtKey(i,ein,eout);}catch(e){writeLn("ease err "+e)}}
var pp=co.property("Focus Distance");pp.setValuesAtTimes(tt,[1364.9641719875524, 1188.8359314881131, 976.8131103909014, 1058.4765913449958, 920.2000456660448, 894.8270953870863, 915.4735095014149, 936.0834120967568, 962.4191223039985, 923.5696487950655, 858.8059173329084, 762.6572773338904, 641.9443022316588, 622.1552370181216, 598.0668731839847, 376.51872680085086]);
for(var i=1;i<=pp.numKeys;i++){var ein=[],eout=[];for(var d=0;d<1;d++){ein.push(new KeyframeEase(0,i==pp.numKeys?10:80));eout.push(new KeyframeEase(0,i==pp.numKeys-1?85:12));}try{pp.setTemporalEaseAtKey(i,ein,eout);}catch(e){writeLn("ease err "+e)}}
app.project.save(new File("__OUT__"));writeLn("ok");