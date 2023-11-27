import * as THREE from "three";
import { OrbitControls} from '../threejs/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from '../threejs/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../meshopt_decoder/meshopt_decoder.module.js';
import GUI from '../threejs/examples/jsm/libs/lil-gui.module.min.js';
import Stats from '../stats/stats.module.js';

import * as CANNON from "../cannonjs/cannon-es.js";
import CannonDebugger from "../cannonjs/cannon-es-debugger.js";

let elThreejs = document.getElementById("threejs");
let camera,scene,renderer,stats;

// helpers to debug
let axesHelper;
let controls;
let gui;

// show and move cube
let cubeThree;
let keyboard = {};

// camera follow player
let enableFollow = true;

// cannon variables
let world;
let cannonDebugger;
let timeStep = 1 / 60;
let cubeBody, planeBody;
let slipperyMaterial, groundMaterial;
let obstacleBody;
let obstaclesBodies = [];
let obstaclesMeshes = [];
// let instancedObstacle;
let instancedObstacleLow;
let instancedObstacleHigh;
const numberOfInstances = 20;

init();

async function init() {

  // Scene
	scene = new THREE.Scene();

  // Camera
	camera = new THREE.PerspectiveCamera(
		75,
		window.innerWidth / window.innerHeight,
		0.1,
		1000
	);
  camera.position.z = 10;
  camera.position.y = 5;

  stats = createStats();
  document.body.appendChild( stats.domElement );

  // render
	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setPixelRatio(window.devicePixelRatio);
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.shadowMap.enabled = true;

  const ambient = new THREE.HemisphereLight(0xffffbb, 0x080820);
  scene.add(ambient);

  const light = new THREE.DirectionalLight(0xFFFFFF, 1);
  light.position.set( 1, 10, 6);
  scene.add(light);

  // orbitControls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.rotateSpeed = 1.0
  controls.zoomSpeed = 1.2
  controls.enablePan = false
  controls.dampingFactor = 0.2
  controls.minDistance = 10
  controls.maxDistance = 500
  controls.enabled = false

	elThreejs.appendChild(renderer.domElement);

  initCannon();

  addBackground();

  addPlaneBody();
  addPlane();

  addCubeBody();
  await addCube();

  addObstacleBody();
  await addObstacle();

  addContactMaterials();

  addKeysListener();
	addGUI();

  animate()
}

function createStats() {
  var stats = new Stats();
  stats.setMode(0);

  stats.domElement.style.position = 'absolute';
  stats.domElement.style.left = '0';
  stats.domElement.style.top = '0';

  return stats;
}

function animate(){


	renderer.render(scene, camera);

  movePlayer();

  if (enableFollow) followPlayer();

  world.step(timeStep);
	cannonDebugger.update();

  cubeThree.position.copy(cubeBody.position);
  cubeThree.position.y = cubeBody.position.y - 1.3;
  cubeThree.quaternion.copy(cubeBody.quaternion);

  let newMatrix = new THREE.Matrix4();

  let lowIndex = 0;
  let highIndex = 0;
  
  for (let i = 0; i < obstaclesBodies.length; i++) {
    let auxQuat = obstaclesBodies[i].quaternion;
    let auxObj = {
      _x: auxQuat.x,
      _y: auxQuat.y,
      _z: auxQuat.z,
      _w: auxQuat.w,
    };

    newMatrix.makeRotationFromQuaternion(auxObj);

    let auxPos = obstaclesBodies[i].position;

    const posVector3 = new THREE.Vector3(auxPos.x, auxPos.y, auxPos.z);
    newMatrix.setPosition(posVector3);

    // se com base na distância for low
    const cameraPosition = camera.position.clone();

    console.log(i, posVector3.distanceTo(cameraPosition))
    if (posVector3.distanceTo(cameraPosition) > 30) {
      instancedObstacleLow.setMatrixAt(lowIndex++, newMatrix);
    } else {
      instancedObstacleHigh.setMatrixAt(highIndex++, newMatrix);
    }
    // setMatrix 
    
    // obstaclesMeshes[i].position.copy(obstaclesBodies[i].position);
		// obstaclesMeshes[i].quaternion.copy(obstaclesBodies[i].quaternion);
	}

  console.log(lowIndex, highIndex);

  // for do lowindex até o numberOfInstances
  const zeroMatrix = newMatrix.multiplyScalar(0);
  for (let i=lowIndex; i<numberOfInstances; i++) {
    instancedObstacleLow.setMatrixAt(i, zeroMatrix);
  }
  // setMatrixAt (lowindex) matriz zero

  // for do highindex até o numberOfInstances
  for (let i=highIndex; i<numberOfInstances; i++) {
    instancedObstacleHigh.setMatrixAt(i, zeroMatrix);
  }
  // setMatrixAt (highindex) matriz zero

  instancedObstacleLow.instanceMatrix.needsUpdate = true;
  instancedObstacleLow.computeBoundingBox();
  instancedObstacleLow.computeBoundingSphere();

  instancedObstacleHigh.instanceMatrix.needsUpdate = true;
  instancedObstacleHigh.computeBoundingBox();
  instancedObstacleHigh.computeBoundingSphere();

	requestAnimationFrame(animate);

  stats.update();
}

function addCubeBody(){
  let cubeShape = new CANNON.Box(new CANNON.Vec3(1,1.3,2));
  slipperyMaterial = new CANNON.Material('slippery');
  cubeBody = new CANNON.Body({ mass: 100,material: slipperyMaterial });
  cubeBody.addShape(cubeShape, new CANNON.Vec3(0,0,-1));

  const polyhedronShape = createCustomShape()
  cubeBody.addShape(polyhedronShape, new CANNON.Vec3(-1, -1.3, 1));

  // change rotation
  cubeBody.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI / 180 * 180);
  
  cubeBody.position.set(0, 2, 0);

  cubeBody.linearDamping = 0.5;

  world.addBody(cubeBody);
}

async function addCube(){
  // let geometry = new THREE.BoxGeometry(2,2,2);
  // let material = new THREE.MeshBasicMaterial({color: 'pink'});
  // cubeThree = new THREE.Mesh(geometry, material);
  // cubeThree.position.set(0, 1, 0);
  // console.log(cubeThree, "cube");
  // scene.add(cubeThree);

  const gltfLoader = new GLTFLoader().setPath( 'src/assets/' );
	const carLoaddedd = await gltfLoader.loadAsync( 'car.glb' );

	cubeThree = carLoaddedd.scene.children[0];
  scene.add(cubeThree);

}


function addPlaneBody(){
  groundMaterial = new CANNON.Material('ground')
  const planeShape = new CANNON.Box(new CANNON.Vec3(10, 0.01, 100));
	planeBody = new CANNON.Body({ mass: 0, material: groundMaterial });
	planeBody.addShape(planeShape);
	planeBody.position.set(0, 0, -90);
	world.addBody(planeBody);
}



function addPlane(){
  const texture = new THREE.TextureLoader().load( "src/assets/plane.png" );

  let geometry =  new THREE.BoxGeometry(20, 0, 200);
  let material = new THREE.MeshBasicMaterial({map: texture});
  let planeThree = new THREE.Mesh(geometry, material);
  planeThree.position.set(0, 0, -90);
  scene.add(planeThree);
}

function addObstacleBody(){

  for (let i = 0; i < numberOfInstances; i++) {
    let obstacleShape = new CANNON.Box(new CANNON.Vec3(1, 1, 1));
    obstacleBody = new CANNON.Body({ mass: 1 });
    obstacleBody.addShape(obstacleShape);
		obstacleBody.position.set(0, 5,-(i+1) * 15);

    world.addBody(obstacleBody);
    obstaclesBodies.push(obstacleBody);

  }
}

function findMeshRecursive(object) {
  if (object instanceof THREE.Mesh) return object;

  return findMeshRecursive(object.children[0]);
}

async function addObstacle(){
  const gltfLoader = new GLTFLoader().setPath( 'src/assets/' );

  gltfLoader.setMeshoptDecoder(MeshoptDecoder);

	const barrelLowLoaded = await gltfLoader.loadAsync( 'barrel_low.gltf' );
  let testGeometry = new THREE.BoxGeometry(2,2,2);
  let barrelLowGeometry = barrelLowLoaded.scene.children[0].geometry;
  console.log("LOW GEOMETRY:",barrelLowGeometry);
  const textureLow = new THREE.TextureLoader().load( "src/assets/barrel_texture.png" );

  const barrelHighLoaded = await gltfLoader.loadAsync( 'barrel.gltf' );
  const barrelHighMesh = findMeshRecursive(barrelHighLoaded.scene);
  let barrelHighGeometry = barrelHighMesh.geometry;
  console.log("HIGH GEOMETRY:", barrelHighGeometry);
  
  const textureHigh = new THREE.TextureLoader().load( "src/assets/barrel_texture.png" );

  let material = new THREE.MeshBasicMaterial({ map: textureLow });
  instancedObstacleLow = new THREE.InstancedMesh(testGeometry, material, numberOfInstances);

  material = new THREE.MeshBasicMaterial({ map: textureHigh });
  instancedObstacleHigh = new THREE.InstancedMesh(barrelHighGeometry, material, numberOfInstances);
  // let obstacle = new THREE.Mesh(geometry, material);

  for (let i=0; i < numberOfInstances; i++) {
    const color = new THREE.Color( 'white' );
    instancedObstacleLow.setColorAt(i, color);
    instancedObstacleHigh.setColorAt(i, color);
  }

  scene.add(instancedObstacleLow);
  scene.add(instancedObstacleHigh);
}


function addContactMaterials(){
  const slippery_ground = new CANNON.ContactMaterial(groundMaterial, slipperyMaterial, {
    friction: 0.00,
    restitution: 0.1, //bounciness
    contactEquationStiffness: 1e8,
    contactEquationRelaxation: 3,
  })

  // We must add the contact materials to the world
  world.addContactMaterial(slippery_ground)

}

function addKeysListener(){
  window.addEventListener('keydown', function(event){
    keyboard[event.key] = true;
  } , false);
  window.addEventListener('keyup', function(event){
    keyboard[event.key] = false;
  } , false);
}

function movePlayer(){

  // up letter W
  // if(keyboard[87]) cubeThree.position.z -= 0.1
  // if(keyboard[87]) cubeThree.translateZ(-0.1);

  const strengthWS = 500;
  const forceForward = new CANNON.Vec3(0, 0, strengthWS)
  if(keyboard["w"]) cubeBody.applyLocalForce(forceForward);

  // down letter S
  const forceBack = new CANNON.Vec3(0, 0, -strengthWS)
  if(keyboard["s"]) cubeBody.applyLocalForce(forceBack);

  // left letter A
  // if(keyboard[65]) cube.rotation.y += 0.01;
  // if(keyboard[65]) cube.rotateY(0.01);

  const strengthAD = 200;
  const forceLeft= new CANNON.Vec3(0, strengthAD, 0)
  if(keyboard["a"]) cubeBody.applyTorque(forceLeft);

  // right letter D
  const forceRigth= new CANNON.Vec3(0, -strengthAD, 0)
  if(keyboard["d"]) cubeBody.applyTorque(forceRigth);

}

function followPlayer(){
  camera.position.x = cubeThree.position.x;
  camera.position.y = cubeThree.position.y + 5;
  camera.position.z = cubeThree.position.z + 10;
}

function addGUI(){
  gui = new GUI();
  const options = {
		orbitsControls: false
	}

  gui.add(options, 'orbitsControls').onChange( value => {
		if (value){
			controls.enabled = true;
			enableFollow = false;
		}else{
			controls.enabled = false;
			enableFollow = true;
		}
	});
  gui.hide();

  // show and hide GUI if user press g
  window.addEventListener('keydown', function(event){
    if(event.key == "g"){
      if(gui._hidden){
        gui.show();
      }else{
        gui.hide();
      }
    }
  })
}

function initCannon() {
	// Setup world
	world = new CANNON.World();
	world.gravity.set(0, -9.8, 0);

	initCannonDebugger();
}

function initCannonDebugger(){
  cannonDebugger = new CannonDebugger(scene, world, {
		onInit(body, mesh) {
      mesh.visible = false;
			// Toggle visibiliy on "d" press
			document.addEventListener("keydown", (event) => {
				if (event.key === "f") {
					mesh.visible = !mesh.visible;
				}
			});
		},
	});
}

function createCustomShape(){
  const vertices = [
		new CANNON.Vec3(2, 0, 0),
		new CANNON.Vec3(2, 0, 2),
		new CANNON.Vec3(2, 2, 0),
		new CANNON.Vec3(0, 0, 0),
		new CANNON.Vec3(0, 0, 2),
		new CANNON.Vec3(0, 2, 0),
	]

	return new CANNON.ConvexPolyhedron({
		vertices,
		faces: [
      [3, 4, 5],
			[2, 1, 0],
			[1,2,5,4],
			[0,3,4,1],
			[0,2,5,3],
		]
	})
}

async function addBackground(){
	const gltfLoader = new GLTFLoader().setPath( 'src/assets/' );

	const mountainLoaded = await gltfLoader.loadAsync( 'mountain.glb' );
	let mountainMesh = mountainLoaded.scene.children[0];
	mountainMesh.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -Math.PI / 180 *90);
	mountainMesh.position.set(0, 60, -90);
	mountainMesh.scale.set(0.008,0.008,0.008);
	scene.add(mountainMesh);

	const domeLoaded = await gltfLoader.loadAsync( 'skydome.glb' );
	let domeMesh = domeLoaded.scene.children[0];
	domeMesh.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -Math.PI / 180 *90);
	domeMesh.position.set(0, -40, 0);
	domeMesh.scale.set(0.1, 0.1, 0.1);
	scene.add(domeMesh);
}