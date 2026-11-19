import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TextureBundle } from './textures';
import type { ActiveQualityTier } from './types';

function tagShared<T extends THREE.BufferGeometry | THREE.Material>(obj: T): T {
  obj.userData.sharedPool = true;
  return obj;
}

interface PlayerSharedPool {
  suitMat: THREE.MeshStandardMaterial;
  armorMat: THREE.MeshStandardMaterial;
  skinMat: THREE.MeshStandardMaterial;
  metalMat: THREE.MeshStandardMaterial;
  tankMat: THREE.MeshStandardMaterial;
  visorMat: THREE.MeshStandardMaterial;
  lampLensMat: THREE.MeshStandardMaterial;
  trimMats: Map<string, THREE.MeshStandardMaterial>;
  pelvisGeo: THREE.BufferGeometry;
  beltGeo: THREE.BufferGeometry;
  chestCoreGeo: THREE.BufferGeometry;
  chestPlateGeo: THREE.BufferGeometry;
  yokeGeo: THREE.BufferGeometry;
  collarRingGeo: THREE.BufferGeometry;
  tankGeo: THREE.BufferGeometry;
  bandGeo: THREE.BufferGeometry;
  valveGeo: THREE.BufferGeometry;
  manifoldGeo: THREE.BufferGeometry;
  neckGeo: THREE.BufferGeometry;
  craniumGeo: THREE.BufferGeometry;
  chinGuardGeo: THREE.BufferGeometry;
  visorGeo: THREE.BufferGeometry;
  visorRimGeo: THREE.BufferGeometry;
  lampBodyGeo: THREE.BufferGeometry;
  lampLensGeo: THREE.BufferGeometry;
  pauldronGeo: THREE.BufferGeometry;
  upperArmGeo: THREE.BufferGeometry;
  elbowGeo: THREE.BufferGeometry;
  lowerArmGeo: THREE.BufferGeometry;
  gloveGeo: THREE.BufferGeometry;
  thighGeo: THREE.BufferGeometry;
  kneeGeo: THREE.BufferGeometry;
  shinGeo: THREE.BufferGeometry;
  bootAnkleGeo: THREE.BufferGeometry;
  bootGeo: THREE.BufferGeometry;
}

interface MonsterSharedPool {
  skinMat: THREE.MeshPhysicalMaterial;
  finMat: THREE.MeshPhysicalMaterial;
  hornMat: THREE.MeshPhysicalMaterial;
  mouthMat: THREE.MeshPhysicalMaterial;
  eyeIrisMat: THREE.MeshPhysicalMaterial;
  corneaMat: THREE.MeshPhysicalMaterial;
  toothMat: THREE.MeshPhysicalMaterial;
  upperSkullGeo: THREE.BufferGeometry;
  palateGeo: THREE.BufferGeometry;
  mergedHornsGeo: THREE.BufferGeometry | null;
  headCrestGeo: THREE.BufferGeometry;
  eyeballGeo: THREE.BufferGeometry;
  corneaGeo: THREE.BufferGeometry;
  mergedUpperTeeth: THREE.BufferGeometry | null;
  lowerJawGeo: THREE.BufferGeometry;
  sublingualGeo: THREE.BufferGeometry;
  mergedLowerTeeth: THREE.BufferGeometry | null;
  tendonGeo: THREE.BufferGeometry;
  mergedTongueGeo: THREE.BufferGeometry | null;
  wakeRingGeo: THREE.BufferGeometry;
  scaledBodies: Map<string, { bodyGeo: THREE.BufferGeometry; finGeo: THREE.BufferGeometry; bowGeo: THREE.BufferGeometry }>;
}

interface PropSharedPool {
  cpBaseMat: THREE.MeshStandardMaterial;
  cpCollarMat: THREE.MeshStandardMaterial;
  cpBasePlateGeo: THREE.BufferGeometry;
  cpInnerRingGeo: THREE.BufferGeometry;
  cpStrutGeo: THREE.BufferGeometry;
  cpRingGeo: THREE.BufferGeometry;
  cpCoreGeo: THREE.BufferGeometry;
  exitFrameMat: THREE.MeshStandardMaterial;
  exitTrimSteelMat: THREE.MeshStandardMaterial;
  exitGlowMat: THREE.MeshStandardMaterial;
  exitBollardGeo: THREE.BufferGeometry;
  exitCapGeo: THREE.BufferGeometry;
  exitSignHousingGeo: THREE.BufferGeometry;
  exitSignGeo: THREE.BufferGeometry;
  exitSizedGeos: Map<
    string,
    {
      postGeo: THREE.BufferGeometry;
      footGeo: THREE.BufferGeometry;
      ribGeo: THREE.BufferGeometry;
      lintelGeo: THREE.BufferGeometry;
      upperBeamGeo: THREE.BufferGeometry;
      thresholdGeo: THREE.BufferGeometry;
      portalGeo: THREE.BufferGeometry;
    }
  >;
}

interface EntityResourcePool {
  textures: TextureBundle;
  quality: ActiveQualityTier;
  player?: PlayerSharedPool;
  monster?: MonsterSharedPool;
  props?: PropSharedPool;
}

const entityPools = new WeakMap<TextureBundle, EntityResourcePool>();

function getEntityPool(textures: TextureBundle): EntityResourcePool {
  let pool = entityPools.get(textures);
  if (!pool) {
    pool = { textures, quality: 'standard' };
    entityPools.set(textures, pool);
  }
  return pool;
}

let fallbackPropPool: PropSharedPool | null = null;
function getPropSharedPool(): PropSharedPool {
  if (fallbackPropPool) return fallbackPropPool;
  fallbackPropPool = {
    cpBaseMat: tagShared(new THREE.MeshStandardMaterial({ color: 0x334044, roughness: 0.42, metalness: 0.72 })),
    cpCollarMat: tagShared(new THREE.MeshStandardMaterial({ color: 0x9aa9ad, roughness: 0.22, metalness: 0.88 })),
    cpBasePlateGeo: tagShared(new THREE.CylinderGeometry(0.84, 0.96, 0.12, 8)),
    cpInnerRingGeo: tagShared(new THREE.CylinderGeometry(0.62, 0.68, 0.08, 16)),
    cpStrutGeo: tagShared(new THREE.CylinderGeometry(0.035, 0.045, 0.42, 8)),
    cpRingGeo: tagShared(new THREE.TorusGeometry(0.58, 0.05, 12, 28)),
    cpCoreGeo: tagShared(new THREE.OctahedronGeometry(0.2, 1)),
    exitFrameMat: tagShared(new THREE.MeshStandardMaterial({ color: 0x222c30, roughness: 0.36, metalness: 0.78 })),
    exitTrimSteelMat: tagShared(new THREE.MeshStandardMaterial({ color: 0x9aaab0, roughness: 0.22, metalness: 0.88 })),
    exitGlowMat: tagShared(
      new THREE.MeshStandardMaterial({
        color: 0x72f2c8,
        emissive: 0x38d9a9,
        emissiveIntensity: 2.1,
        roughness: 0.14,
        transparent: true,
        opacity: 0.84,
        side: THREE.DoubleSide,
      })
    ),
    exitBollardGeo: tagShared(new THREE.CylinderGeometry(0.09, 0.11, 0.95, 12)),
    exitCapGeo: tagShared(new THREE.CylinderGeometry(0.085, 0.085, 0.12, 12)),
    exitSignHousingGeo: tagShared(new THREE.BoxGeometry(1.75, 0.4, 0.72)),
    exitSignGeo: tagShared(new THREE.BoxGeometry(1.52, 0.24, 0.76)),
    exitSizedGeos: new Map(),
  };
  return fallbackPropPool;
}

export function setEntityQualityTier(textures: TextureBundle, tier: ActiveQualityTier): void {
  const pool = getEntityPool(textures);
  pool.quality = tier;
  if (pool.monster) {
    const m = pool.monster;
    const isSmooth = tier === 'smooth';
    const isUltra = tier === 'ultra';
    m.skinMat.clearcoat = isSmooth ? 0.35 : 0.92;
    m.skinMat.envMapIntensity = isSmooth ? 0.85 : isUltra ? 1.45 : 1.25;
    m.finMat.clearcoat = isSmooth ? 0.3 : 0.88;
    m.hornMat.clearcoat = isSmooth ? 0.2 : 0.6;
    m.mouthMat.clearcoat = isSmooth ? 0.35 : 0.95;
    m.toothMat.clearcoat = isSmooth ? 0.3 : 0.85;
  }
}

export function disposeEntityResources(textures: TextureBundle): void {
  const pool = entityPools.get(textures);
  if (pool) {
    if (pool.player) {
      const p = pool.player;
      p.pelvisGeo.dispose();
      p.beltGeo.dispose();
      p.chestCoreGeo.dispose();
      p.chestPlateGeo.dispose();
      p.yokeGeo.dispose();
      p.collarRingGeo.dispose();
      p.tankGeo.dispose();
      p.bandGeo.dispose();
      p.valveGeo.dispose();
      p.manifoldGeo.dispose();
      p.neckGeo.dispose();
      p.craniumGeo.dispose();
      p.chinGuardGeo.dispose();
      p.visorGeo.dispose();
      p.visorRimGeo.dispose();
      p.lampBodyGeo.dispose();
      p.lampLensGeo.dispose();
      p.pauldronGeo.dispose();
      p.upperArmGeo.dispose();
      p.elbowGeo.dispose();
      p.lowerArmGeo.dispose();
      p.gloveGeo.dispose();
      p.thighGeo.dispose();
      p.kneeGeo.dispose();
      p.shinGeo.dispose();
      p.bootAnkleGeo.dispose();
      p.bootGeo.dispose();
      p.suitMat.dispose();
      p.armorMat.dispose();
      p.skinMat.dispose();
      p.metalMat.dispose();
      p.tankMat.dispose();
      p.visorMat.dispose();
      p.lampLensMat.dispose();
      p.trimMats.forEach((m) => m.dispose());
      p.trimMats.clear();
    }
    if (pool.monster) {
      const m = pool.monster;
      m.upperSkullGeo.dispose();
      m.palateGeo.dispose();
      m.mergedHornsGeo?.dispose();
      m.headCrestGeo.dispose();
      m.eyeballGeo.dispose();
      m.corneaGeo.dispose();
      m.mergedUpperTeeth?.dispose();
      m.lowerJawGeo.dispose();
      m.sublingualGeo.dispose();
      m.mergedLowerTeeth?.dispose();
      m.tendonGeo.dispose();
      m.mergedTongueGeo?.dispose();
      m.wakeRingGeo.dispose();
      m.scaledBodies.forEach((sb) => {
        sb.bodyGeo.dispose();
        sb.finGeo.dispose();
        sb.bowGeo.dispose();
      });
      m.scaledBodies.clear();
      m.skinMat.dispose();
      m.finMat.dispose();
      m.hornMat.dispose();
      m.mouthMat.dispose();
      m.eyeIrisMat.dispose();
      m.corneaMat.dispose();
      m.toothMat.dispose();
    }
    entityPools.delete(textures);
  }
  if (fallbackPropPool) {
    const pr = fallbackPropPool;
    pr.cpBaseMat.dispose();
    pr.cpCollarMat.dispose();
    pr.cpBasePlateGeo.dispose();
    pr.cpInnerRingGeo.dispose();
    pr.cpStrutGeo.dispose();
    pr.cpRingGeo.dispose();
    pr.cpCoreGeo.dispose();
    pr.exitFrameMat.dispose();
    pr.exitTrimSteelMat.dispose();
    pr.exitGlowMat.dispose();
    pr.exitBollardGeo.dispose();
    pr.exitCapGeo.dispose();
    pr.exitSignHousingGeo.dispose();
    pr.exitSignGeo.dispose();
    pr.exitSizedGeos.forEach((sg) => {
      sg.postGeo.dispose();
      sg.footGeo.dispose();
      sg.ribGeo.dispose();
      sg.lintelGeo.dispose();
      sg.upperBeamGeo.dispose();
      sg.thresholdGeo.dispose();
      sg.portalGeo.dispose();
    });
    pr.exitSizedGeos.clear();
    fallbackPropPool = null;
  }
}

function getPlayerPool(textures: TextureBundle): PlayerSharedPool {
  const rootPool = getEntityPool(textures);
  if (rootPool.player) return rootPool.player;

  const p: PlayerSharedPool = {
    suitMat: tagShared(new THREE.MeshStandardMaterial({ color: 0x223037, roughness: 0.62, metalness: 0.14 })),
    armorMat: tagShared(new THREE.MeshStandardMaterial({ color: 0x161d21, roughness: 0.48, metalness: 0.25 })),
    skinMat: tagShared(new THREE.MeshStandardMaterial({ color: 0xd4b199, roughness: 0.58, metalness: 0.02 })),
    metalMat: tagShared(
      new THREE.MeshStandardMaterial({
        map: textures.metalAlbedo,
        bumpMap: textures.metalBump,
        bumpScale: 0.015,
        color: 0xc6d3d8,
        roughness: 0.24,
        metalness: 0.86,
      })
    ),
    tankMat: tagShared(new THREE.MeshStandardMaterial({ color: 0x3b4d52, roughness: 0.28, metalness: 0.72 })),
    visorMat: tagShared(
      new THREE.MeshStandardMaterial({
        color: 0x162b33,
        emissive: 0x183c47,
        emissiveIntensity: 0.55,
        roughness: 0.08,
        metalness: 0.85,
      })
    ),
    lampLensMat: tagShared(
      new THREE.MeshStandardMaterial({
        color: 0xeaf8ff,
        emissive: 0xc8f0ff,
        emissiveIntensity: 2.2,
        roughness: 0.08,
      })
    ),
    trimMats: new Map(),
    pelvisGeo: tagShared(new THREE.CapsuleGeometry(0.145, 0.14, 8, 14)),
    beltGeo: tagShared(new THREE.CylinderGeometry(0.185, 0.19, 0.075, 16)),
    chestCoreGeo: tagShared(new THREE.CylinderGeometry(0.215, 0.175, 0.46, 16)),
    chestPlateGeo: tagShared(new THREE.CapsuleGeometry(0.14, 0.18, 6, 12)),
    yokeGeo: tagShared(new THREE.CylinderGeometry(0.225, 0.21, 0.09, 16)),
    collarRingGeo: tagShared(new THREE.TorusGeometry(0.11, 0.024, 10, 20)),
    tankGeo: tagShared(new THREE.CapsuleGeometry(0.058, 0.26, 8, 12)),
    bandGeo: tagShared(new THREE.CylinderGeometry(0.063, 0.063, 0.035, 12)),
    valveGeo: tagShared(new THREE.CylinderGeometry(0.024, 0.028, 0.06, 10)),
    manifoldGeo: tagShared(new THREE.CylinderGeometry(0.018, 0.018, 0.18, 8)),
    neckGeo: tagShared(new THREE.CylinderGeometry(0.068, 0.082, 0.11, 12)),
    craniumGeo: tagShared(new THREE.SphereGeometry(0.135, 18, 14)),
    chinGuardGeo: tagShared(new THREE.CylinderGeometry(0.095, 0.082, 0.085, 14)),
    visorGeo: tagShared(
      new THREE.SphereGeometry(0.122, 16, 12, -Math.PI * 0.38, Math.PI * 0.76, Math.PI * 0.34, Math.PI * 0.32)
    ),
    visorRimGeo: tagShared(new THREE.TorusGeometry(0.132, 0.014, 8, 22)),
    lampBodyGeo: tagShared(new THREE.CylinderGeometry(0.032, 0.038, 0.055, 12)),
    lampLensGeo: tagShared(new THREE.CircleGeometry(0.027, 12)),
    pauldronGeo: tagShared(new THREE.SphereGeometry(0.072, 12, 10)),
    upperArmGeo: tagShared(new THREE.CapsuleGeometry(0.056, 0.17, 6, 12)),
    elbowGeo: tagShared(new THREE.SphereGeometry(0.052, 10, 8)),
    lowerArmGeo: tagShared(new THREE.CapsuleGeometry(0.048, 0.16, 6, 12)),
    gloveGeo: tagShared(new THREE.SphereGeometry(0.048, 10, 8)),
    thighGeo: tagShared(new THREE.CapsuleGeometry(0.078, 0.27, 6, 12)),
    kneeGeo: tagShared(new THREE.SphereGeometry(0.068, 10, 8)),
    shinGeo: tagShared(new THREE.CapsuleGeometry(0.064, 0.26, 6, 12)),
    bootAnkleGeo: tagShared(new THREE.CylinderGeometry(0.068, 0.072, 0.08, 12)),
    bootGeo: tagShared(new THREE.CapsuleGeometry(0.066, 0.12, 6, 12)),
  };
  rootPool.player = p;
  return p;
}

const _trimColorTmp = new THREE.Color();

export interface PlayerRig {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  headGroup: THREE.Group;
  leftArm: THREE.Group;
  leftForearm: THREE.Group;
  rightArm: THREE.Group;
  rightForearm: THREE.Group;
  leftLeg: THREE.Group;
  leftShin: THREE.Group;
  rightLeg: THREE.Group;
  rightShin: THREE.Group;
  headlamp: THREE.SpotLight;
  lampAnchor: THREE.Group;
  pushAnimTimer: number;
  pushedAnimTimer: number;
  setVisible: (visible: boolean) => void;
  setShadowDetail: (tier: ActiveQualityTier) => void;
  dispose: () => void;
}

export type PlayerAnimState = 'idle' | 'walk' | 'run' | 'jump' | 'fall' | 'swim';

export function createPlayerRig(
  textures: TextureBundle,
  accentColor: string | number = 0xc99c38,
  isRemote = false
): PlayerRig {
  const root = new THREE.Group();
  const pool = getPlayerPool(textures);
  const trimHex = _trimColorTmp.set(accentColor).getHexString();
  let trimMat = pool.trimMats.get(trimHex);
  if (!trimMat) {
    trimMat = tagShared(
      new THREE.MeshStandardMaterial({
        color: _trimColorTmp.getHex(), // safety dive harness trim / multiplayer color
        roughness: 0.36,
        metalness: 0.24,
      })
    );
    pool.trimMats.set(trimHex, trimMat);
  }

  const primaryShadowMeshes: THREE.Mesh[] = [];
  const detailShadowMeshes: THREE.Mesh[] = [];

  const hips = new THREE.Group();
  hips.position.y = 0.92;
  root.add(hips);

  // Contoured pelvis & utility belt
  const pelvis = new THREE.Mesh(pool.pelvisGeo, pool.armorMat);
  pelvis.rotation.z = Math.PI / 2;
  pelvis.scale.set(0.82, 1, 0.78);
  pelvis.castShadow = true;
  primaryShadowMeshes.push(pelvis);
  hips.add(pelvis);

  const belt = new THREE.Mesh(pool.beltGeo, trimMat);
  belt.scale.set(1.06, 1, 0.74);
  belt.position.y = 0.05;
  hips.add(belt);

  // Torso
  const torso = new THREE.Group();
  torso.position.y = 0.09;
  hips.add(torso);

  // Sculpted tapered chest & rib armor
  const chestCore = new THREE.Mesh(pool.chestCoreGeo, pool.suitMat);
  chestCore.scale.set(1.06, 1, 0.7);
  chestCore.position.y = 0.25;
  chestCore.castShadow = true;
  chestCore.receiveShadow = true;
  primaryShadowMeshes.push(chestCore);
  torso.add(chestCore);

  const chestPlate = new THREE.Mesh(pool.chestPlateGeo, pool.armorMat);
  chestPlate.rotation.z = Math.PI / 2;
  chestPlate.scale.set(0.95, 1, 0.72);
  chestPlate.position.set(0, 0.34, 0.05);
  chestPlate.castShadow = true;
  detailShadowMeshes.push(chestPlate);
  torso.add(chestPlate);

  // Shoulder yoke & safety collar ring
  const yoke = new THREE.Mesh(pool.yokeGeo, pool.armorMat);
  yoke.scale.set(1.12, 1, 0.68);
  yoke.position.y = 0.45;
  torso.add(yoke);

  const collarRing = new THREE.Mesh(pool.collarRingGeo, pool.metalMat);
  collarRing.rotation.x = Math.PI / 2;
  collarRing.position.y = 0.505;
  torso.add(collarRing);

  // Dual Oxygen Dive Cylinders + Manifold + Breather Hose
  for (const side of [-1, 1] as const) {
    const tank = new THREE.Mesh(pool.tankGeo, pool.tankMat);
    tank.position.set(side * 0.078, 0.29, -0.175);
    tank.castShadow = true;
    detailShadowMeshes.push(tank);
    torso.add(tank);

    const band = new THREE.Mesh(pool.bandGeo, trimMat);
    band.position.set(side * 0.078, 0.36, -0.175);
    torso.add(band);

    const valve = new THREE.Mesh(pool.valveGeo, pool.metalMat);
    valve.position.set(side * 0.078, 0.48, -0.175);
    torso.add(valve);
  }
  const manifold = new THREE.Mesh(pool.manifoldGeo, pool.metalMat);
  manifold.rotation.z = Math.PI / 2;
  manifold.position.set(0, 0.49, -0.175);
  torso.add(manifold);

  // Head + Dive Helmet + Visor + Headlamp
  const headGroup = new THREE.Group();
  headGroup.position.y = 0.54;
  torso.add(headGroup);

  const neck = new THREE.Mesh(pool.neckGeo, pool.suitMat);
  neck.position.y = 0.04;
  headGroup.add(neck);

  // Sculpted dome dive hood / helmet shell
  const cranium = new THREE.Mesh(pool.craniumGeo, pool.suitMat);
  cranium.scale.set(0.94, 1.06, 1.02);
  cranium.position.y = 0.205;
  cranium.castShadow = true;
  primaryShadowMeshes.push(cranium);
  headGroup.add(cranium);

  const chinGuard = new THREE.Mesh(pool.chinGuardGeo, pool.armorMat);
  chinGuard.position.set(0, 0.13, 0.025);
  headGroup.add(chinGuard);

  // Tinted Curved Dive Goggle Visor (+Z forward)
  const visor = new THREE.Mesh(pool.visorGeo, pool.visorMat);
  visor.rotation.y = Math.PI / 2;
  visor.position.set(0, 0.205, 0.028);
  headGroup.add(visor);

  const visorRim = new THREE.Mesh(pool.visorRimGeo, trimMat);
  visorRim.rotation.x = Math.PI / 2;
  visorRim.position.set(0, 0.255, 0);
  headGroup.add(visorRim);

  const lampBody = new THREE.Mesh(pool.lampBodyGeo, pool.metalMat);
  lampBody.rotation.x = Math.PI / 2;
  lampBody.position.set(0, 0.27, 0.132);
  headGroup.add(lampBody);

  const lampLens = new THREE.Mesh(pool.lampLensGeo, pool.lampLensMat);
  lampLens.position.set(0, 0.27, 0.161);
  headGroup.add(lampLens);

  // Player forward headlamp Spotlight (+Z is forward in player local space)
  // Parented to root via lampAnchor so hiding body meshes (hips.visible = false) with intensity = 0
  // keeps NUM_SPOT_LIGHTS constant across the entire lifecycle and avoids synchronous shader recompilation freezes.
  const lampAnchor = new THREE.Group();
  lampAnchor.position.set(0, 1.55, 0);
  root.add(lampAnchor);

  const headlamp = new THREE.SpotLight(0xdff4ff, isRemote ? 0 : 3.6, 26, Math.PI / 4.4, 0.55, 1.35);
  headlamp.position.set(0, 0.27, 0.18);
  const lampTarget = new THREE.Object3D();
  lampTarget.position.set(0, -0.22, 6.5);
  if (!isRemote) {
    lampAnchor.add(lampTarget);
    headlamp.target = lampTarget;
    lampAnchor.add(headlamp);
  }

  // Helper to build contoured capsule + joint limbs
  const buildArm = (side: -1 | 1) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.265, 0.45, 0);
    torso.add(shoulder);

    const pauldron = new THREE.Mesh(pool.pauldronGeo, pool.armorMat);
    pauldron.scale.set(1.05, 0.9, 1.0);
    shoulder.add(pauldron);

    const upper = new THREE.Mesh(pool.upperArmGeo, pool.suitMat);
    upper.position.y = -0.13;
    upper.castShadow = true;
    detailShadowMeshes.push(upper);
    shoulder.add(upper);

    const forearm = new THREE.Group();
    forearm.position.y = -0.265;
    shoulder.add(forearm);

    const elbow = new THREE.Mesh(pool.elbowGeo, pool.armorMat);
    forearm.add(elbow);

    const lower = new THREE.Mesh(pool.lowerArmGeo, pool.suitMat);
    lower.position.y = -0.12;
    lower.castShadow = true;
    detailShadowMeshes.push(lower);
    forearm.add(lower);

    const glove = new THREE.Mesh(pool.gloveGeo, pool.skinMat);
    glove.scale.set(0.88, 1.12, 0.95);
    glove.position.y = -0.255;
    forearm.add(glove);

    return { shoulder, forearm };
  };

  const buildLeg = (side: -1 | 1) => {
    const hipJoint = new THREE.Group();
    hipJoint.position.set(side * 0.115, -0.05, 0);
    hips.add(hipJoint);

    const thigh = new THREE.Mesh(pool.thighGeo, pool.suitMat);
    thigh.position.y = -0.205;
    thigh.castShadow = true;
    detailShadowMeshes.push(thigh);
    hipJoint.add(thigh);

    const shinJoint = new THREE.Group();
    shinJoint.position.y = -0.415;
    hipJoint.add(shinJoint);

    const knee = new THREE.Mesh(pool.kneeGeo, pool.armorMat);
    knee.scale.set(1, 1.05, 1.15);
    shinJoint.add(knee);

    const shin = new THREE.Mesh(pool.shinGeo, pool.suitMat);
    shin.position.y = -0.195;
    shin.castShadow = true;
    detailShadowMeshes.push(shin);
    shinJoint.add(shin);

    const bootAnkle = new THREE.Mesh(pool.bootAnkleGeo, pool.armorMat);
    bootAnkle.position.y = -0.35;
    shinJoint.add(bootAnkle);

    const boot = new THREE.Mesh(pool.bootGeo, trimMat);
    boot.rotation.x = Math.PI / 2;
    boot.scale.set(1.05, 1, 0.72);
    boot.position.set(0, -0.41, 0.045);
    boot.castShadow = true;
    detailShadowMeshes.push(boot);
    shinJoint.add(boot);

    return { hipJoint, shinJoint };
  };

  const lArm = buildArm(-1);
  const rArm = buildArm(1);
  const lLeg = buildLeg(-1);
  const rLeg = buildLeg(1);

  const setShadowDetail = (tier: ActiveQualityTier) => {
    const castPrimary = tier !== 'smooth';
    const castDetail = tier === 'ultra' && !isRemote;
    for (let i = 0; i < primaryShadowMeshes.length; i++) primaryShadowMeshes[i].castShadow = castPrimary;
    for (let i = 0; i < detailShadowMeshes.length; i++) detailShadowMeshes[i].castShadow = castDetail;
  };
  setShadowDetail(getEntityPool(textures).quality);

  return {
    root,
    hips,
    torso,
    headGroup,
    leftArm: lArm.shoulder,
    leftForearm: lArm.forearm,
    rightArm: rArm.shoulder,
    rightForearm: rArm.forearm,
    leftLeg: lLeg.hipJoint,
    leftShin: lLeg.shinJoint,
    rightLeg: rLeg.hipJoint,
    rightShin: rLeg.shinJoint,
    headlamp,
    lampAnchor,
    pushAnimTimer: 0,
    pushedAnimTimer: 0,
    setVisible: (visible: boolean) => {
      hips.visible = visible;
      if (!isRemote) {
        headlamp.intensity = visible ? 3.6 : 0;
      }
    },
    setShadowDetail,
    dispose: () => {
      // Geometries and base materials are shared in EntityResourcePool and disposed once on engine teardown.
      lampAnchor.removeFromParent();
      if (!isRemote) {
        headlamp.dispose();
      }
    },
  };
}

export function createNameplateSprite(username: string, accentColor: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = 'rgba(8, 16, 19, 0.78)';
    ctx.beginPath();
    ctx.roundRect(12, 12, 232, 40, 12);
    ctx.fill();

    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#eaf6f8';
    ctx.font = 'bold 22px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(username.slice(0, 16), 128, 33);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.85, 0.46, 1);
  sprite.position.set(0, 2.08, 0);
  return sprite;
}

export function animatePlayerRig(
  rig: PlayerRig,
  state: PlayerAnimState,
  horizSpeed: number,
  time: number,
  dt: number
): void {
  const hasActionAnim = rig.pushAnimTimer > 0 || rig.pushedAnimTimer > 0;
  const k = Math.min(1, dt * (hasActionAnim ? 26 : 14));

  let targetHipsY = 0.92;
  let targetTorsoX = 0;
  let targetTorsoY = 0;
  let targetHeadX = 0;

  let lArmX = 0;
  let lArmZ = 0.08;
  let lForeX = -0.15;
  let rArmX = 0;
  let rArmZ = -0.08;
  let rForeX = -0.15;

  let lLegX = 0;
  let lShinX = 0;
  let rLegX = 0;
  let rShinX = 0;

  if (state === 'idle') {
    const breath = Math.sin(time * 2.1);
    targetHipsY = 0.92 + breath * 0.012;
    lArmX = Math.sin(time * 1.4) * 0.04;
    rArmX = -Math.sin(time * 1.4) * 0.04;
    lArmZ = 0.08;
    rArmZ = -0.08;
  } else if (state === 'walk' || state === 'run') {
    const isRun = state === 'run';
    const freq = isRun ? 12.5 : 8.2;
    const amp = isRun ? 0.92 : 0.56;
    const phase = time * freq;
    const swing = Math.sin(phase);
    const bob = Math.abs(Math.cos(phase)) * (isRun ? 0.075 : 0.035);

    targetHipsY = 0.9 + bob;
    targetTorsoX = isRun ? 0.22 : 0.08;
    targetTorsoY = swing * (isRun ? 0.14 : 0.07);
    targetHeadX = -targetTorsoX * 0.6;

    lLegX = swing * amp;
    rLegX = -swing * amp;
    lShinX = Math.max(0, -Math.cos(phase) * (isRun ? 1.1 : 0.65));
    rShinX = Math.max(0, Math.cos(phase) * (isRun ? 1.1 : 0.65));

    lArmX = -swing * amp * 0.9;
    rArmX = swing * amp * 0.9;
    lForeX = isRun ? -1.15 : -0.45;
    rForeX = isRun ? -1.15 : -0.45;
  } else if (state === 'jump') {
    targetHipsY = 0.96;
    targetTorsoX = 0.1;
    lArmX = -0.85;
    rArmX = -0.75;
    lArmZ = 0.35;
    rArmZ = -0.35;
    lForeX = -0.5;
    rForeX = -0.5;
    lLegX = -0.45;
    lShinX = 0.85;
    rLegX = 0.25;
    rShinX = 0.35;
  } else if (state === 'fall') {
    targetHipsY = 0.94;
    targetTorsoX = -0.08;
    const flail = Math.sin(time * 10) * 0.18;
    lArmX = -1.35 + flail;
    rArmX = -1.35 - flail;
    lArmZ = 0.55;
    rArmZ = -0.55;
    lLegX = -0.2 + flail * 0.5;
    rLegX = 0.2 - flail * 0.5;
    lShinX = 0.45;
    rShinX = 0.45;
  } else if (state === 'swim') {
    const strokeFreq = horizSpeed > 0.5 ? 5.6 : 3.0;
    const p = time * strokeFreq;
    targetHipsY = 0.62 + Math.sin(p) * 0.05;
    targetTorsoX = horizSpeed > 0.5 ? 0.72 : 0.35; // leaning forward in water
    targetHeadX = -targetTorsoX * 0.85; // keep head above surface

    // Alternating / breaststroke swim motion
    lArmX = -1.1 + Math.sin(p) * 0.85;
    rArmX = -1.1 + Math.sin(p + Math.PI) * 0.85;
    lArmZ = 0.45 + Math.cos(p) * 0.35;
    rArmZ = -0.45 - Math.cos(p + Math.PI) * 0.35;
    lForeX = -0.6;
    rForeX = -0.6;

    // Flutter kick
    lLegX = 0.35 + Math.sin(p * 2.0) * 0.45;
    rLegX = 0.35 - Math.sin(p * 2.0) * 0.45;
    lShinX = 0.35;
    rShinX = 0.35;
  }

  // Friends Mode shove animation (fast forward two-hand push)
  if (rig.pushAnimTimer > 0) {
    rig.pushAnimTimer = Math.max(0, rig.pushAnimTimer - dt);
    const u = Math.max(0, Math.min(1, 1 - rig.pushAnimTimer / 0.38));
    const shove = Math.sin(Math.PI * Math.pow(u, 0.65));
    targetTorsoX += shove * 0.42;
    targetHeadX -= shove * 0.2;
    lArmX = THREE.MathUtils.lerp(lArmX, -1.52, shove * 0.92);
    rArmX = THREE.MathUtils.lerp(rArmX, -1.52, shove * 0.92);
    lArmZ = THREE.MathUtils.lerp(lArmZ, -0.06, shove);
    rArmZ = THREE.MathUtils.lerp(rArmZ, 0.06, shove);
    lForeX = THREE.MathUtils.lerp(lForeX, -0.08, shove * 0.9);
    rForeX = THREE.MathUtils.lerp(rForeX, -0.08, shove * 0.9);
  }

  // Friends Mode pushed recoil / stagger animation
  if (rig.pushedAnimTimer > 0) {
    rig.pushedAnimTimer = Math.max(0, rig.pushedAnimTimer - dt);
    const v = Math.max(0, Math.min(1, 1 - rig.pushedAnimTimer / 0.45));
    const stagger = Math.sin(Math.PI * Math.pow(v, 0.6));
    targetHipsY -= stagger * 0.06;
    targetTorsoX -= stagger * 0.48;
    targetHeadX += stagger * 0.32;
    lArmX -= stagger * 0.75;
    rArmX -= stagger * 0.75;
    lArmZ += stagger * 0.52;
    rArmZ -= stagger * 0.52;
  }

  rig.hips.position.y = THREE.MathUtils.lerp(rig.hips.position.y, targetHipsY, k);
  rig.torso.rotation.x = THREE.MathUtils.lerp(rig.torso.rotation.x, targetTorsoX, k);
  rig.torso.rotation.y = THREE.MathUtils.lerp(rig.torso.rotation.y, targetTorsoY, k);
  rig.headGroup.rotation.x = THREE.MathUtils.lerp(rig.headGroup.rotation.x, targetHeadX, k);

  rig.leftArm.rotation.x = THREE.MathUtils.lerp(rig.leftArm.rotation.x, lArmX, k);
  rig.leftArm.rotation.z = THREE.MathUtils.lerp(rig.leftArm.rotation.z, lArmZ, k);
  rig.leftForearm.rotation.x = THREE.MathUtils.lerp(rig.leftForearm.rotation.x, lForeX, k);

  rig.rightArm.rotation.x = THREE.MathUtils.lerp(rig.rightArm.rotation.x, rArmX, k);
  rig.rightArm.rotation.z = THREE.MathUtils.lerp(rig.rightArm.rotation.z, rArmZ, k);
  rig.rightForearm.rotation.x = THREE.MathUtils.lerp(rig.rightForearm.rotation.x, rForeX, k);

  rig.leftLeg.rotation.x = THREE.MathUtils.lerp(rig.leftLeg.rotation.x, lLegX, k);
  rig.leftShin.rotation.x = THREE.MathUtils.lerp(rig.leftShin.rotation.x, lShinX, k);
  rig.rightLeg.rotation.x = THREE.MathUtils.lerp(rig.rightLeg.rotation.x, rLegX, k);
  rig.rightShin.rotation.x = THREE.MathUtils.lerp(rig.rightShin.rotation.x, rShinX, k);

  const headBaseY = 0.09 + 0.54 * Math.cos(rig.torso.rotation.x);
  const headBaseZ = 0.54 * Math.sin(rig.torso.rotation.x);
  rig.lampAnchor.position.set(0, rig.hips.position.y + headBaseY, headBaseZ);
  rig.lampAnchor.rotation.set(rig.torso.rotation.x + rig.headGroup.rotation.x, rig.torso.rotation.y, 0);
}

export interface SerpentSegment {
  group: THREE.Object3D;
  bone: THREE.Bone;
  worldPos: THREE.Vector3;
  yaw: number;
  pitch: number;
  roll: number;
  radius: number;
}

export interface MonsterRig {
  root: THREE.Group;
  headAssembly: THREE.Group;
  torso: THREE.Group;
  headGroup: THREE.Group;
  jaw: THREE.Group;
  jawTendons: THREE.Mesh[];
  tongue: THREE.Group;
  leftEye: THREE.Group;
  rightEye: THREE.Group;
  segments: SerpentSegment[];
  bodyMesh: THREE.SkinnedMesh;
  finMesh: THREE.SkinnedMesh;
  skeleton: THREE.Skeleton;
  wakeRing: THREE.Mesh;
  bowWake: THREE.Mesh;
  scale: number;
  swimPhase: number;
  emergeAmount: number;
  setShadowDetail: (tier: ActiveQualityTier) => void;
  dispose: () => void;
}

const SERPENT_BONE_COUNT = 24;
const SERPENT_BONE_STEP = 0.86;

function buildContinuousSerpentBodyGeometry(scale: number): THREE.BufferGeometry {
  const axialRings = 112;
  const radialSegs = 28;
  const totalLength = (SERPENT_BONE_COUNT - 1) * SERPENT_BONE_STEP; // ~19.78m before scale
  const zStart = 0.24; // tucks cleanly into rear skull collar
  const zSpan = totalLength + 0.55;

  const vertCount = (axialRings + 1) * (radialSegs + 1);
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const skinIndices = new Uint16Array(vertCount * 4);
  const skinWeights = new Float32Array(vertCount * 4);

  const assignBoneWeights = (vIdx: number, zWorldUnscaled: number) => {
    const fb = THREE.MathUtils.clamp(-zWorldUnscaled / SERPENT_BONE_STEP, 0, SERPENT_BONE_COUNT - 1);
    const center = Math.round(fb);
    const candidates: number[] = [];
    for (let d = -1; d <= 1; d++) {
      const bi = THREE.MathUtils.clamp(center + d, 0, SERPENT_BONE_COUNT - 1);
      if (!candidates.includes(bi)) candidates.push(bi);
    }
    let wSum = 0;
    const rawW = [0, 0, 0, 0];
    const bIds = [0, 0, 0, 0];
    for (let k = 0; k < candidates.length; k++) {
      const bi = candidates[k];
      const dist = fb - bi;
      const w = Math.exp(-(dist * dist) / 0.52);
      bIds[k] = bi;
      rawW[k] = w;
      wSum += w;
    }
    const base = vIdx * 4;
    for (let k = 0; k < 4; k++) {
      skinIndices[base + k] = bIds[k];
      skinWeights[base + k] = wSum > 0 ? rawW[k] / wSum : k === 0 ? 1 : 0;
    }
  };

  for (let i = 0; i <= axialRings; i++) {
    const t = i / axialRings;
    const zUnscaled = zStart - t * zSpan;

    // Anatomical sea-serpent body profile:
    // Swells from muscular neck into thick predatory trunk, then tapers into laterally compressed caudal paddle-tail
    let baseRadius: number;
    if (t < 0.07) {
      const k = t / 0.07;
      baseRadius = THREE.MathUtils.lerp(0.46, 0.58, k * k * (3 - 2 * k));
    } else if (t < 0.28) {
      const k = (t - 0.07) / 0.21;
      baseRadius = THREE.MathUtils.lerp(0.58, 0.78, Math.sin(k * Math.PI * 0.5));
    } else if (t < 0.72) {
      const k = (t - 0.28) / 0.44;
      baseRadius = THREE.MathUtils.lerp(0.78, 0.34, Math.pow(k, 1.08));
    } else {
      const k = (t - 0.72) / 0.28;
      baseRadius = THREE.MathUtils.lerp(0.34, 0.025, Math.pow(k, 1.35));
    }

    // Hydrodynamic oar-like lateral compression on rear caudal tail (t > 0.65)
    const paddleFactor = Math.max(0, (t - 0.62) / 0.38);
    const paddleFlare = Math.sin(paddleFactor * Math.PI * 0.85) * 0.34 * (1 - Math.pow(paddleFactor, 3));
    const rx = baseRadius * (1.06 - paddleFactor * 0.68);
    const ry = baseRadius * (0.94 + paddleFactor * 0.45) + paddleFlare;

    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const theta = u * Math.PI * 2;
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);

      // Epaxial dorsal muscle lobes & subtle vertebral ridge
      const dorsalMask = Math.max(0, cosT);
      const epaxial = 1.0 + 0.085 * sinT * sinT * dorsalMask;
      const dorsalRidge = 1.0 + 0.075 * Math.pow(dorsalMask, 7) * (1 - t * 0.35);

      // Slightly flattened armored belly scutes underside
      const ventralFlatten = cosT < 0 ? 0.86 : 1.0;

      // Subtle rib/muscle undulation along trunk
      const muscleTone = 1.0 + Math.sin(t * Math.PI * 22) * 0.012 * (1 - paddleFactor);

      const x = sinT * rx * epaxial * muscleTone * scale;
      const y = cosT * ry * dorsalRidge * ventralFlatten * muscleTone * scale;
      const z = zUnscaled * scale;

      const vIdx = i * (radialSegs + 1) + j;
      positions[vIdx * 3] = x;
      positions[vIdx * 3 + 1] = y;
      positions[vIdx * 3 + 2] = z;

      uvs[vIdx * 2] = u;
      uvs[vIdx * 2 + 1] = t;

      assignBoneWeights(vIdx, zUnscaled);
    }
  }

  const indices: number[] = [];
  const stride = radialSegs + 1;
  for (let i = 0; i < axialRings; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      // Outward CCW winding: (b - a) = +X, (c - a) = -Z => (+X) x (-Z) = +Y
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndices, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeights, 4));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  // Weld seam normals (j=0 and j=radialSegs) so dorsal lighting has zero seam
  const normAttr = geo.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i <= axialRings; i++) {
    const i0 = i * stride;
    const i1 = i0 + radialSegs;
    const nx = normAttr.getX(i0) + normAttr.getX(i1);
    const ny = normAttr.getY(i0) + normAttr.getY(i1);
    const nz = normAttr.getZ(i0) + normAttr.getZ(i1);
    const inv = 1 / Math.max(1e-5, Math.hypot(nx, ny, nz));
    normAttr.setXYZ(i0, nx * inv, ny * inv, nz * inv);
    normAttr.setXYZ(i1, nx * inv, ny * inv, nz * inv);
  }
  normAttr.needsUpdate = true;
  geo.computeTangents();
  return geo;
}

function buildContinuousDorsalFinGeometry(scale: number): THREE.BufferGeometry {
  // Continuous organic undulating dorsal fin membrane + caudal crest along spine
  const axialRings = 112;
  const totalLength = (SERPENT_BONE_COUNT - 1) * SERPENT_BONE_STEP;
  const zStart = -0.35;
  const zSpan = totalLength - 0.15;

  const vertCount = (axialRings + 1) * 2;
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const skinIndices = new Uint16Array(vertCount * 4);
  const skinWeights = new Float32Array(vertCount * 4);

  for (let i = 0; i <= axialRings; i++) {
    const t = i / axialRings;
    const zUnscaled = zStart - t * zSpan;

    // Match dorsal ridge Y on body
    let baseRadius: number;
    if (t < 0.07) {
      const k = t / 0.07;
      baseRadius = THREE.MathUtils.lerp(0.46, 0.58, k * k * (3 - 2 * k));
    } else if (t < 0.28) {
      const k = (t - 0.07) / 0.21;
      baseRadius = THREE.MathUtils.lerp(0.58, 0.78, Math.sin(k * Math.PI * 0.5));
    } else if (t < 0.72) {
      const k = (t - 0.28) / 0.44;
      baseRadius = THREE.MathUtils.lerp(0.78, 0.34, Math.pow(k, 1.08));
    } else {
      const k = (t - 0.72) / 0.28;
      baseRadius = THREE.MathUtils.lerp(0.34, 0.025, Math.pow(k, 1.35));
    }
    const paddleFactor = Math.max(0, (t - 0.62) / 0.38);
    const paddleFlare = Math.sin(paddleFactor * Math.PI * 0.85) * 0.34 * (1 - Math.pow(paddleFactor, 3));
    const ry = baseRadius * (0.94 + paddleFactor * 0.45) + paddleFlare;
    const baseY = ry * (1.0 + 0.075 * (1 - t * 0.35)) - 0.06;

    // Scalloped cartilaginous fin height (rises dramatically on neck/trunk and flares at caudal fin)
    const trunkArch = Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.48;
    const tailArch = Math.sin(Math.max(0, (t - 0.68) / 0.32) * Math.PI) * 0.42;
    const scallop = 0.82 + 0.18 * Math.sin(t * Math.PI * 36);
    const finHeight = Math.max(0.02, (0.14 + trunkArch + tailArch) * scallop * (1 - Math.pow(t, 6)));

    const fb = THREE.MathUtils.clamp(-zUnscaled / SERPENT_BONE_STEP, 0, SERPENT_BONE_COUNT - 1);
    const b0 = Math.floor(fb);
    const b1 = Math.min(SERPENT_BONE_COUNT - 1, b0 + 1);
    const alpha = fb - b0;

    for (let row = 0; row < 2; row++) {
      const vIdx = i * 2 + row;
      const swayX = row === 1 ? Math.sin(t * Math.PI * 14) * 0.035 : 0;
      const y = (baseY + (row === 1 ? finHeight : 0)) * scale;
      const z = (zUnscaled - (row === 1 ? 0.14 : 0)) * scale;
      positions[vIdx * 3] = swayX * scale;
      positions[vIdx * 3 + 1] = y;
      positions[vIdx * 3 + 2] = z;

      uvs[vIdx * 2] = t;
      uvs[vIdx * 2 + 1] = row;

      const sb = vIdx * 4;
      skinIndices[sb] = b0;
      skinIndices[sb + 1] = b1;
      skinIndices[sb + 2] = 0;
      skinIndices[sb + 3] = 0;
      skinWeights[sb] = 1 - alpha;
      skinWeights[sb + 1] = alpha;
      skinWeights[sb + 2] = 0;
      skinWeights[sb + 3] = 0;
    }
  }

  const indices: number[] = [];
  for (let i = 0; i < axialRings; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c, b, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndices, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeights, 4));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function sculptUpperSkullGeometry(): THREE.BufferGeometry {
  // Parametric anatomical sea-viper / predator upper skull (z: -0.82 neck blend -> +1.64 snout tip)
  const slices = 36;
  const radials = 32;
  const vertCount = (slices + 1) * (radials + 1);
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);

  for (let i = 0; i <= slices; i++) {
    const s = i / slices; // 0 = rear neck base, 1 = snout tip
    const z = THREE.MathUtils.lerp(-0.82, 1.64, s);

    // Broad triangular venomous cranium width profile
    let w: number;
    if (s < 0.28) {
      // Rear neck -> powerful temporal jaw adductor flare
      const k = s / 0.28;
      w = THREE.MathUtils.lerp(0.56, 0.86, Math.sin(k * Math.PI * 0.5));
    } else if (s < 0.55) {
      // Temporal -> orbital socket narrowing
      const k = (s - 0.28) / 0.27;
      w = THREE.MathUtils.lerp(0.86, 0.56, k * k * (3 - 2 * k));
    } else {
      // Snout taper to hydrodynamic rounded muzzle
      const k = (s - 0.55) / 0.45;
      w = THREE.MathUtils.lerp(0.56, 0.14, Math.pow(k, 1.38));
    }
    if (s > 0.94) {
      const tipK = (s - 0.94) / 0.06;
      w *= Math.sqrt(Math.max(0.01, 1 - tipK * tipK));
    }

    // Cranial dorsal height
    let hTop: number;
    if (s < 0.34) {
      hTop = THREE.MathUtils.lerp(0.42, 0.52, s / 0.34);
    } else {
      const k = (s - 0.34) / 0.66;
      hTop = THREE.MathUtils.lerp(0.52, 0.06, Math.pow(k, 1.35));
    }
    if (s > 0.95) {
      const tipK = (s - 0.95) / 0.05;
      hTop *= Math.sqrt(Math.max(0.02, 1 - tipK * tipK));
    }

    // Mouth cavity palate arch starts from s > 0.26 forward
    const mouthMask = THREE.MathUtils.smoothstep(s, 0.22, 0.42) * (1 - THREE.MathUtils.smoothstep(s, 0.92, 1.0));
    const eyeSocketMask = Math.exp(-Math.pow((s - 0.52) / 0.11, 2));
    const nostrilMask = Math.exp(-Math.pow((s - 0.88) / 0.045, 2));

    for (let j = 0; j <= radials; j++) {
      const u = j / radials;
      const theta = u * Math.PI * 2;
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);

      let x = sinT * w;
      let y: number;

      if (cosT >= 0) {
        // Dorsal skull dome + sculpted supraorbital brow ridges + nasal bridge
        const browAngle = Math.abs(Math.abs(theta > Math.PI ? Math.PI * 2 - theta : theta) - 0.85);
        const browRidge = Math.exp(-(browAngle * browAngle) / 0.09) * 0.13 * eyeSocketMask;
        // Deepened orbital socket right below brow ridge
        const socketAngle = Math.abs(Math.abs(theta > Math.PI ? Math.PI * 2 - theta : theta) - 1.24);
        const socketIndent = Math.exp(-(socketAngle * socketAngle) / 0.06) * 0.15 * eyeSocketMask;
        // Flared nostril pit near snout tip
        const nosAngle = Math.abs(Math.abs(theta > Math.PI ? Math.PI * 2 - theta : theta) - 0.72);
        const nosIndent = Math.exp(-(nosAngle * nosAngle) / 0.05) * 0.055 * nostrilMask;

        const rScale = 1 - socketIndent - nosIndent;
        x *= rScale;
        y = cosT * hTop + browRidge + 0.04;
      } else {
        // Ventral underside: rear neck smoothly closes; front arches UP into vaulted palatal mouth cavity!
        const bellyH = THREE.MathUtils.lerp(0.36, 0.02, Math.pow(s, 1.4));
        const palateArch = mouthMask * (0.28 * Math.pow(-cosT, 1.2));
        // Lateral maxillary lip/gum ridges curve downward around outer rim
        const lipRim = mouthMask * Math.exp(-Math.pow(Math.abs(sinT) - 0.86, 2) / 0.04) * 0.075;
        y = cosT * bellyH + palateArch - lipRim + 0.04;
        // Slightly tuck palatal roof inward
        x *= 1 - mouthMask * 0.08 * (-cosT);
      }

      const vIdx = i * (radials + 1) + j;
      positions[vIdx * 3] = x;
      positions[vIdx * 3 + 1] = y;
      positions[vIdx * 3 + 2] = z;

      uvs[vIdx * 2] = u;
      uvs[vIdx * 2 + 1] = s * 0.35;
    }
  }

  const indices: number[] = [];
  const stride = radials + 1;
  for (let i = 0; i < slices; i++) {
    for (let j = 0; j < radials; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      // z increases with i (+Z), j increases (+X) at top => (b - a) x (c - a) = (+X) x (+Z) = -Y (inward)
      // Flip winding to (a, c, b) and (b, c, d) for OUTWARD normals!
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const normAttr = geo.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i <= slices; i++) {
    const i0 = i * stride;
    const i1 = i0 + radials;
    const nx = normAttr.getX(i0) + normAttr.getX(i1);
    const ny = normAttr.getY(i0) + normAttr.getY(i1);
    const nz = normAttr.getZ(i0) + normAttr.getZ(i1);
    const inv = 1 / Math.max(1e-5, Math.hypot(nx, ny, nz));
    normAttr.setXYZ(i0, nx * inv, ny * inv, nz * inv);
    normAttr.setXYZ(i1, nx * inv, ny * inv, nz * inv);
  }
  normAttr.needsUpdate = true;
  geo.computeTangents();
  return geo;
}

function sculptLowerJawGeometry(): THREE.BufferGeometry {
  // Anatomical hinged mandible (z: -0.22 hinge -> +1.42 chin tip)
  const slices = 28;
  const radials = 24;
  const vertCount = (slices + 1) * (radials + 1);
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);

  for (let i = 0; i <= slices; i++) {
    const s = i / slices;
    const z = THREE.MathUtils.lerp(-0.22, 1.44, s);

    let w = THREE.MathUtils.lerp(0.66, 0.14, Math.pow(s, 1.28));
    if (s < 0.14) w *= THREE.MathUtils.lerp(0.75, 1.0, s / 0.14);
    if (s > 0.93) {
      const tk = (s - 0.93) / 0.07;
      w *= Math.sqrt(Math.max(0.02, 1 - tk * tk));
    }

    const hBot = THREE.MathUtils.lerp(0.24, 0.05, Math.pow(s, 1.35));
    const cavityMask = THREE.MathUtils.smoothstep(s, 0.12, 0.35) * (1 - THREE.MathUtils.smoothstep(s, 0.9, 1.0));

    for (let j = 0; j <= radials; j++) {
      const u = j / radials;
      const theta = u * Math.PI * 2;
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);

      const x = sinT * w;
      let y: number;
      if (cosT >= 0) {
        // Upper surface of lower jaw: concave sublingual mouth floor + raised tooth rims on left/right
        const toothRim = cavityMask * Math.exp(-Math.pow(Math.abs(sinT) - 0.82, 2) / 0.05) * 0.065;
        const tongueTrough = -cavityMask * (0.09 * Math.pow(cosT, 1.2));
        y = cosT * 0.06 + toothRim + tongueTrough;
      } else {
        // Sculpted muscular chin keel & lower jaw profile
        y = cosT * hBot;
      }

      const vIdx = i * (radials + 1) + j;
      positions[vIdx * 3] = x;
      positions[vIdx * 3 + 1] = y;
      positions[vIdx * 3 + 2] = z;

      uvs[vIdx * 2] = u;
      uvs[vIdx * 2 + 1] = s * 0.25;
    }
  }

  const indices: number[] = [];
  const stride = radials + 1;
  for (let i = 0; i < slices; i++) {
    for (let j = 0; j < radials; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const normAttr = geo.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i <= slices; i++) {
    const i0 = i * stride;
    const i1 = i0 + radials;
    const nx = normAttr.getX(i0) + normAttr.getX(i1);
    const ny = normAttr.getY(i0) + normAttr.getY(i1);
    const nz = normAttr.getZ(i0) + normAttr.getZ(i1);
    const inv = 1 / Math.max(1e-5, Math.hypot(nx, ny, nz));
    normAttr.setXYZ(i0, nx * inv, ny * inv, nz * inv);
    normAttr.setXYZ(i1, nx * inv, ny * inv, nz * inv);
  }
  normAttr.needsUpdate = true;
  geo.computeTangents();
  return geo;
}

function createSweptHornOrCrestGeometry(
  curvePoints: THREE.Vector3[],
  baseRadiusX: number,
  baseRadiusY: number,
  rings = 16,
  radials = 10
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(curvePoints);
  const frames = curve.computeFrenetFrames(rings, false);
  const vertCount = (rings + 1) * (radials + 1);
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const pt = new THREE.Vector3();

  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    curve.getPointAt(t, pt);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const taper = Math.pow(Math.max(0.005, 1 - t), 0.78);
    const rx = baseRadiusX * taper;
    const ry = baseRadiusY * taper;

    for (let j = 0; j <= radials; j++) {
      const u = j / radials;
      const theta = u * Math.PI * 2;
      const c = Math.cos(theta);
      const s = Math.sin(theta);

      const vIdx = i * (radials + 1) + j;
      positions[vIdx * 3] = pt.x + (N.x * c * rx + B.x * s * ry);
      positions[vIdx * 3 + 1] = pt.y + (N.y * c * rx + B.y * s * ry);
      positions[vIdx * 3 + 2] = pt.z + (N.z * c * rx + B.z * s * ry);
      uvs[vIdx * 2] = u;
      uvs[vIdx * 2 + 1] = t;
    }
  }

  const indices: number[] = [];
  const stride = radials + 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < radials; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createRecurvedToothGeometry(length: number, baseRadius: number, curveBack: number): THREE.BufferGeometry {
  // Smooth recurved predator fang pointing along +Y (or rotated) with backward -Z hook & vertex-color root shading
  const rings = 10;
  const radials = 10;
  const vertCount = (rings + 1) * (radials + 1);
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);

  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const y = t * length;
    const zOffset = -Math.pow(t, 1.85) * curveBack;
    const r = baseRadius * Math.pow(Math.max(0.015, 1 - t), 0.72);

    // Subtle blood-stained gum root transitioning to ivory-white enamel tip
    const rootMix = THREE.MathUtils.smoothstep(t, 0, 0.38);
    const cr = THREE.MathUtils.lerp(0.45, 0.94, rootMix);
    const cg = THREE.MathUtils.lerp(0.18, 0.9, rootMix);
    const cb = THREE.MathUtils.lerp(0.16, 0.8, rootMix);

    for (let j = 0; j <= radials; j++) {
      const theta = (j / radials) * Math.PI * 2;
      const vIdx = i * (radials + 1) + j;
      positions[vIdx * 3] = Math.cos(theta) * r * 0.88;
      positions[vIdx * 3 + 1] = y;
      positions[vIdx * 3 + 2] = zOffset + Math.sin(theta) * r * 1.12;
      colors[vIdx * 3] = cr;
      colors[vIdx * 3 + 1] = cg;
      colors[vIdx * 3 + 2] = cb;
    }
  }

  const indices: number[] = [];
  const stride = radials + 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < radials; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function getMonsterPool(textures: TextureBundle): MonsterSharedPool {
  const rootPool = getEntityPool(textures);
  if (rootPool.monster) return rootPool.monster;

  const isSmooth = rootPool.quality === 'smooth';
  const isUltra = rootPool.quality === 'ultra';

  const skinMat = tagShared(
    new THREE.MeshPhysicalMaterial({
      map: textures.monsterSkin,
      normalMap: textures.monsterNormal,
      normalScale: new THREE.Vector2(1.45, 1.45),
      roughnessMap: textures.monsterRoughness,
      roughness: 0.34,
      metalness: 0.06,
      clearcoat: isSmooth ? 0.35 : 0.92,
      clearcoatRoughness: 0.08,
      ior: 1.44,
      envMapIntensity: isSmooth ? 0.85 : isUltra ? 1.45 : 1.25,
    })
  );

  const finMat = tagShared(
    new THREE.MeshPhysicalMaterial({
      color: 0x101d21,
      roughness: 0.24,
      metalness: 0.08,
      clearcoat: isSmooth ? 0.3 : 0.88,
      clearcoatRoughness: 0.1,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
    })
  );

  const hornMat = tagShared(
    new THREE.MeshPhysicalMaterial({
      color: 0x141d20,
      roughness: 0.34,
      metalness: 0.1,
      clearcoat: isSmooth ? 0.2 : 0.6,
      clearcoatRoughness: 0.18,
    })
  );

  const mouthMat = tagShared(
    new THREE.MeshPhysicalMaterial({
      color: 0x4b0d14,
      roughness: 0.16,
      metalness: 0.02,
      clearcoat: isSmooth ? 0.35 : 0.95,
      clearcoatRoughness: 0.08,
      side: THREE.DoubleSide,
    })
  );

  const eyeIrisMat = tagShared(
    new THREE.MeshPhysicalMaterial({
      map: textures.monsterEye,
      emissiveMap: textures.monsterEye,
      emissive: 0xffa638,
      emissiveIntensity: 0.48,
      roughness: 0.18,
      metalness: 0.05,
    })
  );

  const corneaMat = tagShared(
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.02,
      metalness: 0.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.02,
      ior: 1.4,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    })
  );

  const toothMat = tagShared(
    new THREE.MeshPhysicalMaterial({
      color: 0xf4efe2,
      vertexColors: true,
      roughness: 0.16,
      metalness: 0.04,
      clearcoat: isSmooth ? 0.3 : 0.85,
      clearcoatRoughness: 0.1,
    })
  );

  const upperSkullGeo = tagShared(sculptUpperSkullGeometry());
  const palateGeo = tagShared(
    createSweptHornOrCrestGeometry(
      [
        new THREE.Vector3(0, 0.05, 0.05),
        new THREE.Vector3(0, 0.1, 0.58),
        new THREE.Vector3(0, 0.05, 1.25),
      ],
      0.32,
      0.08,
      10,
      10
    )
  );

  const hornGeos: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1] as const) {
    hornGeos.push(
      createSweptHornOrCrestGeometry(
        [
          new THREE.Vector3(side * 0.42, 0.36, -0.02),
          new THREE.Vector3(side * 0.56, 0.52, -0.45),
          new THREE.Vector3(side * 0.62, 0.56, -0.96),
          new THREE.Vector3(side * 0.52, 0.44, -1.35),
        ],
        0.11,
        0.13,
        16,
        10
      ),
      createSweptHornOrCrestGeometry(
        [
          new THREE.Vector3(side * 0.64, 0.05, 0.05),
          new THREE.Vector3(side * 0.78, 0.02, -0.35),
          new THREE.Vector3(side * 0.72, -0.02, -0.82),
        ],
        0.085,
        0.045,
        12,
        8
      ),
      createSweptHornOrCrestGeometry(
        [
          new THREE.Vector3(side * 0.3, 0.25, 0.92),
          new THREE.Vector3(side * 0.45, 0.39, 0.58),
          new THREE.Vector3(side * 0.56, 0.44, 0.18),
        ],
        0.075,
        0.055,
        10,
        8
      )
    );
  }
  const mergedHornsGeo = mergeGeometries(hornGeos, false);
  hornGeos.forEach((g) => g.dispose());
  if (mergedHornsGeo) tagShared(mergedHornsGeo);

  const headCrestGeo = tagShared(
    createSweptHornOrCrestGeometry(
      [
        new THREE.Vector3(0, 0.48, 0.05),
        new THREE.Vector3(0, 0.62, -0.42),
        new THREE.Vector3(0, 0.56, -0.95),
      ],
      0.045,
      0.16,
      12,
      8
    )
  );

  const eyeballGeo = tagShared(new THREE.SphereGeometry(0.145, 24, 18));
  eyeballGeo.rotateY(-Math.PI / 2);
  const corneaGeo = tagShared(new THREE.SphereGeometry(0.152, 20, 14));

  const fangGeo = createRecurvedToothGeometry(0.32, 0.044, 0.11);
  const toothGeo = createRecurvedToothGeometry(0.16, 0.025, 0.055);
  const palatineToothGeo = createRecurvedToothGeometry(0.12, 0.018, 0.04);

  const bakeTransformedTooth = (
    src: THREE.BufferGeometry,
    px: number,
    py: number,
    pz: number,
    rx: number,
    rz: number,
    s: number
  ): THREE.BufferGeometry => {
    const g = src.clone();
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(px, py, pz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz, 'XYZ')),
      new THREE.Vector3(s, s, s)
    );
    g.applyMatrix4(m);
    return g;
  };

  const upperTeethParts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1] as const) {
    upperTeethParts.push(bakeTransformedTooth(fangGeo, side * 0.15, 0.04, 1.32, Math.PI + 0.08, 0, 1));
  }
  for (let i = 0; i < 7; i++) {
    for (const side of [-1, 1] as const) {
      const z = 1.16 - i * 0.145;
      const x = side * (0.21 + i * 0.036);
      const s = 1.05 - i * 0.06;
      upperTeethParts.push(bakeTransformedTooth(toothGeo, x, 0.04, z, Math.PI + 0.12, side * 0.08, s));
    }
  }
  for (let i = 0; i < 4; i++) {
    for (const side of [-1, 1] as const) {
      upperTeethParts.push(
        bakeTransformedTooth(palatineToothGeo, side * 0.11, 0.07, 1.02 - i * 0.18, Math.PI + 0.18, 0, 1)
      );
    }
  }
  const mergedUpperTeeth = mergeGeometries(upperTeethParts, false);
  upperTeethParts.forEach((g) => g.dispose());
  if (mergedUpperTeeth) tagShared(mergedUpperTeeth);

  const lowerJawGeo = tagShared(sculptLowerJawGeometry());
  const sublingualGeo = tagShared(
    createSweptHornOrCrestGeometry(
      [
        new THREE.Vector3(0, 0.0, 0.06),
        new THREE.Vector3(0, 0.01, 0.65),
        new THREE.Vector3(0, 0.0, 1.24),
      ],
      0.24,
      0.045,
      10,
      10
    )
  );

  const lowerTeethParts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1] as const) {
    lowerTeethParts.push(bakeTransformedTooth(fangGeo, side * 0.12, 0.03, 1.22, -0.08, 0, 0.76));
  }
  for (let i = 0; i < 7; i++) {
    for (const side of [-1, 1] as const) {
      const z = 1.08 - i * 0.14;
      const x = side * (0.18 + i * 0.034);
      const s = 0.95 - i * 0.05;
      lowerTeethParts.push(bakeTransformedTooth(toothGeo, x, 0.02, z, -0.12, side * -0.08, s));
    }
  }
  const mergedLowerTeeth = mergeGeometries(lowerTeethParts, false);
  lowerTeethParts.forEach((g) => g.dispose());
  fangGeo.dispose();
  toothGeo.dispose();
  palatineToothGeo.dispose();
  if (mergedLowerTeeth) tagShared(mergedLowerTeeth);

  const tendonGeo = tagShared(
    createSweptHornOrCrestGeometry(
      [
        new THREE.Vector3(0, 0, -0.08),
        new THREE.Vector3(0, -0.16, 0.06),
        new THREE.Vector3(0, -0.34, 0.14),
      ],
      0.05,
      0.09,
      8,
      8
    )
  );

  const tongueParts: THREE.BufferGeometry[] = [
    createSweptHornOrCrestGeometry(
      [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0.02, 0.36),
        new THREE.Vector3(0, 0.01, 0.68),
      ],
      0.038,
      0.02,
      10,
      8
    ),
  ];
  for (const side of [-1, 1] as const) {
    tongueParts.push(
      createSweptHornOrCrestGeometry(
        [
          new THREE.Vector3(0, 0.01, 0.64),
          new THREE.Vector3(side * 0.045, 0.015, 0.8),
          new THREE.Vector3(side * 0.1, 0.005, 0.96),
        ],
        0.018,
        0.012,
        8,
        6
      )
    );
  }
  const mergedTongueGeo = mergeGeometries(tongueParts, false);
  tongueParts.forEach((g) => g.dispose());
  if (mergedTongueGeo) tagShared(mergedTongueGeo);

  const wakeRingGeo = tagShared(new THREE.RingGeometry(1.15, 2.45, 36));

  const mPool: MonsterSharedPool = {
    skinMat,
    finMat,
    hornMat,
    mouthMat,
    eyeIrisMat,
    corneaMat,
    toothMat,
    upperSkullGeo,
    palateGeo,
    mergedHornsGeo,
    headCrestGeo,
    eyeballGeo,
    corneaGeo,
    mergedUpperTeeth,
    lowerJawGeo,
    sublingualGeo,
    mergedLowerTeeth,
    tendonGeo,
    mergedTongueGeo,
    wakeRingGeo,
    scaledBodies: new Map(),
  };
  rootPool.monster = mPool;
  return mPool;
}

export function createMonsterRig(textures: TextureBundle, scale = 1): MonsterRig {
  const root = new THREE.Group();
  const pool = getMonsterPool(textures);

  const wakeMat = new THREE.MeshBasicMaterial({
    color: 0xd8eef2,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const bowWakeMat = new THREE.MeshBasicMaterial({
    color: 0xe6f7fa,
    transparent: true,
    opacity: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  // --- 1. Continuous Skinned Body & Dorsal Fin Crest (24 Spine Bones) ---
  const bones: THREE.Bone[] = [];
  const segments: SerpentSegment[] = [];
  for (let i = 0; i < SERPENT_BONE_COUNT; i++) {
    const bone = new THREE.Bone();
    bone.rotation.order = 'YXZ';
    bone.position.set(0, 0, -i * SERPENT_BONE_STEP * scale);
    root.add(bone);
    bones.push(bone);

    const t = i / (SERPENT_BONE_COUNT - 1);
    const radiusProfile =
      t < 0.25 ? 0.54 + (t / 0.25) * 0.22 : 0.76 * Math.pow(1 - (t - 0.25) / 0.75, 0.85) + 0.05;
    segments.push({
      group: bone,
      bone,
      worldPos: new THREE.Vector3(0, 0, -i * SERPENT_BONE_STEP * scale),
      yaw: 0,
      pitch: 0,
      roll: 0,
      radius: radiusProfile * scale,
    });
  }

  const scaleKey = scale.toFixed(2);
  let scaled = pool.scaledBodies.get(scaleKey);
  if (!scaled) {
    const bodyGeo = tagShared(buildContinuousSerpentBodyGeometry(scale));
    const finGeo = tagShared(buildContinuousDorsalFinGeometry(scale));
    const bowGeo = tagShared(new THREE.PlaneGeometry(3.8 * scale, 7.5 * scale, 12, 16));
    bowGeo.rotateX(-Math.PI / 2);
    const bPos = bowGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < bPos.count; i++) {
      const px = bPos.getX(i);
      const pz = bPos.getZ(i);
      const backT = THREE.MathUtils.clamp((3.75 * scale - pz) / (7.5 * scale), 0, 1);
      const spread = 0.55 + backT * 1.45;
      bPos.setX(i, px * spread);
      bPos.setY(i, Math.max(0, 0.18 * (1 - Math.abs(px) / (1.9 * scale)) * (1 - backT * 0.6)));
    }
    bowGeo.computeVertexNormals();
    scaled = { bodyGeo, finGeo, bowGeo };
    pool.scaledBodies.set(scaleKey, scaled);
  }

  const skeleton = new THREE.Skeleton(bones);
  root.updateMatrixWorld(true);

  const castTier = getEntityPool(textures).quality;
  const bodyMesh = new THREE.SkinnedMesh(scaled.bodyGeo, pool.skinMat);
  bodyMesh.castShadow = castTier !== 'smooth';
  bodyMesh.receiveShadow = true;
  bodyMesh.frustumCulled = false;
  bodyMesh.bind(skeleton);
  root.add(bodyMesh);

  const finMesh = new THREE.SkinnedMesh(scaled.finGeo, pool.finMat);
  finMesh.castShadow = castTier === 'ultra';
  finMesh.frustumCulled = false;
  finMesh.bind(skeleton);
  root.add(finMesh);

  // --- 2. Sculpted Predator Head Assembly (+Z is forward) ---
  const headAssembly = new THREE.Group();
  headAssembly.scale.setScalar(scale);
  root.add(headAssembly);

  const torso = new THREE.Group();
  headAssembly.add(torso);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.22, 0.14);
  torso.add(headGroup);

  const upperSkullMesh = new THREE.Mesh(pool.upperSkullGeo, pool.skinMat);
  upperSkullMesh.castShadow = castTier !== 'smooth';
  upperSkullMesh.receiveShadow = true;
  headGroup.add(upperSkullMesh);

  const palateMesh = new THREE.Mesh(pool.palateGeo, pool.mouthMat);
  headGroup.add(palateMesh);

  let hornsMesh: THREE.Mesh | null = null;
  if (pool.mergedHornsGeo) {
    hornsMesh = new THREE.Mesh(pool.mergedHornsGeo, pool.hornMat);
    hornsMesh.castShadow = castTier === 'ultra';
    headGroup.add(hornsMesh);
  }

  const headCrest = new THREE.Mesh(pool.headCrestGeo, pool.finMat);
  headGroup.add(headCrest);

  // --- 3. Multi-Layer Realistic Reptilian Predator Eyes ---
  const makeSerpentEye = (side: -1 | 1) => {
    const eyePivot = new THREE.Group();
    eyePivot.position.set(side * 0.43, 0.23, 0.55);
    eyePivot.rotation.y = side * 0.46;
    headGroup.add(eyePivot);

    const eyeball = new THREE.Mesh(pool.eyeballGeo, pool.eyeIrisMat);
    eyeball.scale.set(0.92, 0.96, 1.04);
    eyePivot.add(eyeball);

    const cornea = new THREE.Mesh(pool.corneaGeo, pool.corneaMat);
    cornea.scale.set(0.94, 0.98, 1.06);
    eyePivot.add(cornea);

    return eyePivot;
  };
  const leftEye = makeSerpentEye(-1);
  const rightEye = makeSerpentEye(1);

  if (pool.mergedUpperTeeth) {
    headGroup.add(new THREE.Mesh(pool.mergedUpperTeeth, pool.toothMat));
  }

  // --- 5. Hinged Sculpted Lower Mandible + Stretching Jaw Tendons + Forked Tongue ---
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.05, 0.06);
  headGroup.add(jaw);

  const lowerJawMesh = new THREE.Mesh(pool.lowerJawGeo, pool.skinMat);
  lowerJawMesh.castShadow = castTier === 'ultra';
  jaw.add(lowerJawMesh);

  const sublingual = new THREE.Mesh(pool.sublingualGeo, pool.mouthMat);
  jaw.add(sublingual);

  if (pool.mergedLowerTeeth) {
    jaw.add(new THREE.Mesh(pool.mergedLowerTeeth, pool.toothMat));
  }

  const jawTendons: THREE.Mesh[] = [];
  for (const side of [-1, 1] as const) {
    const tendon = new THREE.Mesh(pool.tendonGeo, pool.mouthMat);
    tendon.position.set(side * 0.44, 0.08, 0.28);
    tendon.rotation.y = side * 0.18;
    headGroup.add(tendon);
    jawTendons.push(tendon);
  }

  const tongue = new THREE.Group();
  tongue.position.set(0, 0.03, 0.56);
  jaw.add(tongue);
  if (pool.mergedTongueGeo) {
    tongue.add(new THREE.Mesh(pool.mergedTongueGeo, pool.mouthMat));
  }

  // --- 6. Surface Wake Ring + V-Shaped Bow-Wave Foam Mesh ---
  const wakeRing = new THREE.Mesh(pool.wakeRingGeo, wakeMat);
  wakeRing.rotation.x = -Math.PI / 2;
  wakeRing.position.y = 0.06;
  wakeRing.scale.setScalar(scale);
  root.add(wakeRing);

  const bowWake = new THREE.Mesh(scaled.bowGeo, bowWakeMat);
  bowWake.position.set(0, 0.06, -1.8 * scale);
  root.add(bowWake);

  return {
    root,
    headAssembly,
    torso,
    headGroup,
    jaw,
    jawTendons,
    tongue,
    leftEye,
    rightEye,
    segments,
    bodyMesh,
    finMesh,
    skeleton,
    wakeRing,
    bowWake,
    scale,
    swimPhase: Math.random() * Math.PI * 2,
    emergeAmount: 0,
    setShadowDetail: (tier: ActiveQualityTier) => {
      const primary = tier !== 'smooth';
      const detail = tier === 'ultra';
      bodyMesh.castShadow = primary;
      upperSkullMesh.castShadow = primary;
      finMesh.castShadow = detail;
      lowerJawMesh.castShadow = detail;
      if (hornsMesh) hornsMesh.castShadow = detail;
    },
    dispose: () => {
      skeleton.dispose();
      wakeMat.dispose();
      bowWakeMat.dispose();
    },
  };
}

const _tmpMonsterLocal = new THREE.Vector3();
const _tmpBoneDir = new THREE.Vector3();
const _tmpUp = new THREE.Vector3(0, 1, 0);
const _tmpRight = new THREE.Vector3();
const _tmpLookMat = new THREE.Matrix4();
const _tmpRollQuat = new THREE.Quaternion();
const _tmpZAxis = new THREE.Vector3(0, 0, 1);

export function resetSerpentTrail(rig: MonsterRig, headPos: THREE.Vector3, yaw: number): void {
  const step = SERPENT_BONE_STEP * rig.scale;
  const bx = -Math.sin(yaw);
  const bz = -Math.cos(yaw);
  rig.emergeAmount = 0;
  rig.headAssembly.position.set(0, -0.04 * rig.scale, 0);
  rig.headAssembly.rotation.y = yaw;
  rig.torso.rotation.z = 0;
  rig.headGroup.rotation.set(0, 0, 0);
  rig.jaw.rotation.x = 0.06;

  for (let i = 0; i < rig.segments.length; i++) {
    const seg = rig.segments[i];
    const dist = i * step;
    const yOff = i === 0 ? 0.12 * rig.scale : -0.08 * rig.scale;
    seg.worldPos.set(headPos.x + bx * dist, headPos.y + yOff, headPos.z + bz * dist);
    seg.yaw = yaw;
    seg.pitch = 0;
    seg.roll = 0;
    seg.bone.position.set(
      seg.worldPos.x - headPos.x,
      seg.worldPos.y - headPos.y,
      seg.worldPos.z - headPos.z
    );
  }
  syncSerpentBones(rig, yaw);
}

export function syncSerpentBones(rig: MonsterRig, headYaw: number): void {
  // Orient every spine bone smoothly along the resolved continuous curve so SkinnedMesh bends organically
  const n = rig.segments.length;
  for (let i = 0; i < n; i++) {
    const seg = rig.segments[i];
    const curr = seg.bone.position;
    if (i === 0) {
      const next = rig.segments[1].bone.position;
      _tmpBoneDir.set(
        Math.sin(headYaw) * 0.6 + (curr.x - next.x) * 0.4,
        (curr.y - next.y) * 0.5,
        Math.cos(headYaw) * 0.6 + (curr.z - next.z) * 0.4
      );
    } else if (i < n - 1) {
      const prev = rig.segments[i - 1].bone.position;
      const next = rig.segments[i + 1].bone.position;
      _tmpBoneDir.subVectors(prev, next);
    } else {
      const prev = rig.segments[i - 1].bone.position;
      _tmpBoneDir.subVectors(prev, curr);
    }

    if (_tmpBoneDir.lengthSq() < 1e-6) {
      _tmpBoneDir.set(Math.sin(headYaw), 0, Math.cos(headYaw));
    } else {
      _tmpBoneDir.normalize();
    }

    // Build orthonormal basis where bone +Z aligns with _tmpBoneDir (forward along spine)
    _tmpRight.crossVectors(_tmpUp, _tmpBoneDir);
    if (_tmpRight.lengthSq() < 1e-5) {
      _tmpRight.set(1, 0, 0);
    } else {
      _tmpRight.normalize();
    }
    const trueUpX = _tmpBoneDir.y * _tmpRight.z - _tmpBoneDir.z * _tmpRight.y;
    const trueUpY = _tmpBoneDir.z * _tmpRight.x - _tmpBoneDir.x * _tmpRight.z;
    const trueUpZ = _tmpBoneDir.x * _tmpRight.y - _tmpBoneDir.y * _tmpRight.x;

    _tmpLookMat.makeBasis(
      _tmpRight,
      _tmpUp.set(trueUpX, trueUpY, trueUpZ),
      _tmpBoneDir
    );
    seg.bone.quaternion.setFromRotationMatrix(_tmpLookMat);
    _tmpUp.set(0, 1, 0);

    if (Math.abs(seg.roll) > 0.0005) {
      _tmpRollQuat.setFromAxisAngle(_tmpZAxis, seg.roll);
      seg.bone.quaternion.multiply(_tmpRollQuat);
    }
  }
}

const _tmpPreyLocal = new THREE.Vector3();
const _tmpPreyWorldPos = new THREE.Vector3();
const _tmpPreyWorldQuat = new THREE.Quaternion();
const _tmpPreyHeadQuat = new THREE.Quaternion();
const _tmpPreyHeadScale = new THREE.Vector3();
const _tmpPreyBasisMat = new THREE.Matrix4().makeBasis(
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 1, 0)
);
const _tmpPreyBasisQuat = new THREE.Quaternion().setFromRotationMatrix(_tmpPreyBasisMat);
const _tmpPreyStartQuat = new THREE.Quaternion();
const _tmpPreyTiltQuat = new THREE.Quaternion();
const _tmpPreyEuler = new THREE.Euler(0, 0, 0, 'YXZ');

export function animateMonsterRig(
  rig: MonsterRig,
  alert: 'calm' | 'searching' | 'chasing',
  playerWorldPos: THREE.Vector3,
  headWorldPos: THREE.Vector3,
  headYaw: number,
  waterY: number,
  time: number,
  dt: number,
  targetEmerge = 0,
  eatProgress = -1
): void {
  const k = Math.min(1, dt * 14);
  const isEating = eatProgress >= 0;
  const eatU = isEating ? THREE.MathUtils.clamp(eatProgress, 0, 1) : 0;
  const isChasing = alert === 'chasing' || isEating;
  const aggro = isChasing ? 1 : alert === 'searching' ? 0.5 : 0.15;

  const effectiveTargetEmerge = isEating
    ? THREE.MathUtils.smoothstep(eatU, 0, 0.14) * (1 - THREE.MathUtils.smoothstep(eatU, 0.9, 1.0) * 0.25)
    : targetEmerge;
  rig.emergeAmount = THREE.MathUtils.lerp(
    rig.emergeAmount,
    effectiveTargetEmerge,
    Math.min(1, dt * (isEating ? 18 : 11))
  );

  // Powerful, rapid swimming undulation during pursuit / rhythmic body sway during eating
  const waveSpeed = isEating ? 9.5 : isChasing ? 27.0 : 4.4;
  rig.swimPhase = (rig.swimPhase + dt * waveSpeed) % (Math.PI * 200);

  const patrolBob = Math.sin(rig.swimPhase * 0.55) * 0.075;
  const emergeLift = rig.emergeAmount * (isEating ? 1.56 : 1.48) * rig.scale;
  const swimSubmerge = isChasing ? -0.26 * (1 - rig.emergeAmount) * rig.scale : -0.04 * rig.scale;
  const eatHeave = isEating
    ? (Math.sin(eatU * Math.PI * 4.5) * 0.11 * (1 - eatU * 0.4)) * rig.scale
    : 0;
  const headLocalY = emergeLift + swimSubmerge + patrolBob * (1 - rig.emergeAmount * 0.5) + eatHeave;

  rig.headAssembly.position.set(0, headLocalY, 0);
  rig.headAssembly.rotation.y = headYaw;
  rig.torso.rotation.z = isEating
    ? Math.sin(eatU * Math.PI * 5.0) * 0.16 * (1 - eatU * 0.55)
    : Math.sin(rig.swimPhase) * (0.07 + aggro * 0.14);

  // Follow-the-leader continuous kinematic spine + traveling lateral S-wave propulsion
  const segSpacing = SERPENT_BONE_STEP * rig.scale;
  const neckAnchorY = headLocalY + 0.16 * rig.scale;
  let anchorX = headWorldPos.x;
  let anchorY = headWorldPos.y + neckAnchorY;
  let anchorZ = headWorldPos.z;
  let prevYaw = headYaw;

  // Bone 0 locks directly under rear skull collar
  const seg0 = rig.segments[0];
  seg0.worldPos.set(anchorX, anchorY, anchorZ);
  seg0.yaw = headYaw;
  seg0.roll = rig.torso.rotation.z * 0.7;
  seg0.bone.position.set(0, neckAnchorY, 0);

  // Traveling peristaltic swallow bulge down anterior neck bones during swallow (u: 0.42 -> 0.98)
  const bulgeWave = isEating ? THREE.MathUtils.clamp((eatU - 0.4) / 0.58, 0, 1) : -1;
  const bulgeCenter = bulgeWave >= 0 ? bulgeWave * 6.5 : -10;

  for (let i = 1; i < rig.segments.length; i++) {
    const seg = rig.segments[i];
    const dx = anchorX - seg.worldPos.x;
    const dy = anchorY - seg.worldPos.y;
    const dz = anchorZ - seg.worldPos.z;
    const dist = Math.hypot(dx, dy, dz);

    let nx: number;
    let ny: number;
    let nz: number;
    if (dist > 0.0001) {
      const invD = 1 / dist;
      nx = dx * invD;
      ny = THREE.MathUtils.clamp(dy * invD, -0.75, 0.75);
      nz = dz * invD;
    } else {
      nx = Math.sin(prevYaw);
      ny = 0;
      nz = Math.cos(prevYaw);
    }

    // Bound per-vertebra yaw bend so sharp reversals sweep organically without folding or twisting
    const horizLen = Math.hypot(nx, nz);
    if (horizLen > 0.001) {
      const rawYaw = Math.atan2(nx, nz);
      let yawDiff = (rawYaw - prevYaw) % (Math.PI * 2);
      if (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      if (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      const maxBend = 0.58;
      if (Math.abs(yawDiff) > maxBend) {
        const clampedYaw = prevYaw + Math.sign(yawDiff) * maxBend;
        nx = Math.sin(clampedYaw) * horizLen;
        nz = Math.cos(clampedYaw) * horizLen;
      }
      const uLen = Math.hypot(nx, ny, nz);
      if (uLen > 0.0001) {
        nx /= uLen;
        ny /= uLen;
        nz /= uLen;
      }
    }

    seg.worldPos.x = anchorX - nx * segSpacing;
    seg.worldPos.y = anchorY - ny * segSpacing;
    seg.worldPos.z = anchorZ - nz * segSpacing;
    seg.yaw = Math.atan2(nx, nz);
    seg.pitch = -Math.asin(THREE.MathUtils.clamp(ny, -0.75, 0.75));

    // Keep submerged swimming arc beneath water surface (neck rises smoothly during emergence/swallow)
    const maxSegY = waterY - 0.14 * rig.scale + (i < 5 ? rig.emergeAmount * (1 - i / 5) * 0.9 * rig.scale : 0);
    if (seg.worldPos.y > maxSegY) {
      seg.worldPos.y = THREE.MathUtils.lerp(seg.worldPos.y, maxSegY, Math.min(1, dt * 14));
    }

    // Traveling multi-harmonic propulsion S-wave: whip amplitude ramps smoothly toward caudal tail paddle
    const t = i / (rig.segments.length - 1);
    const waveAmp = (0.06 + Math.pow(t, 1.12) * 0.88) * (isEating ? 1.08 : isChasing ? 1.48 : 0.85) * rig.scale;
    const phase = rig.swimPhase - i * 0.44;
    const wave = (Math.sin(phase) + 0.16 * Math.sin(phase * 2.0 - 0.6)) * waveAmp;
    const perpX = Math.cos(seg.yaw);
    const perpZ = -Math.sin(seg.yaw);

    // Subtle vertical dolphin-style swimming arch during rapid lunges
    const vertWave = Math.sin(rig.swimPhase * 0.75 - i * 0.38) * (isChasing ? 0.15 : 0.06) * t * rig.scale;

    const visX = seg.worldPos.x + perpX * wave;
    const visY = Math.min(waterY + 0.9 * rig.scale, seg.worldPos.y + vertWave);
    const visZ = seg.worldPos.z + perpZ * wave;

    seg.bone.position.set(visX - headWorldPos.x, visY - headWorldPos.y, visZ - headWorldPos.z);
    seg.roll = Math.cos(phase) * (0.08 + t * 0.24) * (isChasing ? 1.4 : 0.8);

    anchorX = seg.worldPos.x;
    anchorY = seg.worldPos.y;
    anchorZ = seg.worldPos.z;
    prevYaw = seg.yaw;
  }

  // Apply organic throat bulge across anterior bones when swallowing; clean reset otherwise
  for (let i = 0; i < rig.segments.length; i++) {
    const bone = rig.segments[i].bone;
    if (isEating && i <= 7 && bulgeWave >= 0) {
      const distB = i - bulgeCenter;
      const b = Math.exp(-(distB * distB) / 2.2) * Math.sin(bulgeWave * Math.PI);
      const s = 1 + b * 0.28;
      bone.scale.set(s, s * (1 + b * 0.06), 1);
    } else if (bone.scale.x !== 1 || bone.scale.y !== 1) {
      bone.scale.set(1, 1, 1);
    }
  }

  syncSerpentBones(rig, headYaw);

  if (isEating) {
    // Choreographed predator head lunge -> grab wrench -> upward gulp tilt -> closure
    let targetHeadPitch = -0.14;
    let targetHeadYaw = 0;
    let targetJawX = 0.06;

    if (eatU < 0.16) {
      // Phase 1: Surge & gape wide open
      const p = THREE.MathUtils.smoothstep(eatU, 0, 0.16);
      targetHeadPitch = THREE.MathUtils.lerp(-0.12, 0.06, p);
      targetJawX = THREE.MathUtils.lerp(0.55, 1.08, p);
    } else if (eatU < 0.36) {
      // Phase 2: Clamp jaws onto prey & wrench head side-to-side
      const p = THREE.MathUtils.smoothstep(eatU, 0.16, 0.36);
      targetHeadPitch = THREE.MathUtils.lerp(0.06, -0.26, p);
      targetHeadYaw = Math.sin((eatU - 0.16) * 28) * 0.15 * (1 - p * 0.4);
      targetJawX = THREE.MathUtils.lerp(1.08, 0.54, p);
    } else if (eatU < 0.88) {
      // Phase 3: Tilt head skyward and swallow with two visceral jaw-heave gulps
      const p = (eatU - 0.36) / 0.52;
      const gulpPulse1 = Math.sin(THREE.MathUtils.clamp((eatU - 0.38) / 0.24, 0, 1) * Math.PI);
      const gulpPulse2 = Math.sin(THREE.MathUtils.clamp((eatU - 0.62) / 0.24, 0, 1) * Math.PI);
      targetHeadPitch = -0.32 - gulpPulse1 * 0.18 - gulpPulse2 * 0.16 - p * 0.06;
      targetHeadYaw = Math.sin(p * Math.PI * 3.0) * 0.07;
      targetJawX =
        THREE.MathUtils.lerp(0.52, 0.16, THREE.MathUtils.smoothstep(p, 0, 1)) +
        gulpPulse1 * 0.16 +
        gulpPulse2 * 0.13;
    } else {
      // Phase 4: Final bite seal & head settles back over water
      const p = THREE.MathUtils.smoothstep(eatU, 0.88, 1.0);
      targetHeadPitch = THREE.MathUtils.lerp(-0.38, -0.1, p);
      targetHeadYaw = 0;
      targetJawX = THREE.MathUtils.lerp(0.18, 0.05, p);
    }

    const eatK = Math.min(1, dt * 18);
    rig.headGroup.rotation.y = THREE.MathUtils.lerp(rig.headGroup.rotation.y, targetHeadYaw, eatK);
    rig.headGroup.rotation.x = THREE.MathUtils.lerp(rig.headGroup.rotation.x, targetHeadPitch, eatK);
    rig.jaw.rotation.x = THREE.MathUtils.lerp(rig.jaw.rotation.x, targetJawX, Math.min(1, dt * 22));
    rig.leftEye.rotation.y = -0.46;
    rig.rightEye.rotation.y = 0.46;

    // Retract forked tongue neatly back inside throat during swallowing
    rig.tongue.position.z = THREE.MathUtils.lerp(rig.tongue.position.z, 0.12, eatK);
    rig.tongue.rotation.y = 0;
  } else {
    // Predator head & eyes lock aggressively onto player
    _tmpMonsterLocal.copy(playerWorldPos);
    rig.torso.worldToLocal(_tmpMonsterLocal);
    const lookYaw = THREE.MathUtils.clamp(Math.atan2(_tmpMonsterLocal.x, _tmpMonsterLocal.z), -0.78, 0.78);
    const lookPitch = THREE.MathUtils.clamp(
      -Math.atan2(_tmpMonsterLocal.y - headLocalY, Math.hypot(_tmpMonsterLocal.x, _tmpMonsterLocal.z)),
      -0.55,
      0.45
    );
    rig.headGroup.rotation.y = THREE.MathUtils.lerp(rig.headGroup.rotation.y, lookYaw, k);
    rig.headGroup.rotation.x = THREE.MathUtils.lerp(
      rig.headGroup.rotation.x,
      isChasing ? lookPitch * 0.75 - rig.emergeAmount * 0.18 : lookPitch * 0.45,
      k
    );
    rig.leftEye.rotation.y = -0.46 + lookYaw * 0.25;
    rig.rightEye.rotation.y = 0.46 + lookYaw * 0.25;

    // Powerful hinged jaw gapes wide during pursuit/strike; tendons stretch organically with gape
    const targetJawX = isChasing
      ? 0.52 + rig.emergeAmount * 0.34 + Math.abs(Math.sin(time * 13)) * 0.22
      : 0.06 + Math.sin(time * 2.1) * 0.04;
    rig.jaw.rotation.x = THREE.MathUtils.lerp(rig.jaw.rotation.x, targetJawX, k);

    // Flickering forked tongue lashes out rapidly
    const flick = isChasing ? Math.sin(time * 20) : Math.max(0, Math.sin(time * 2.8) * 3 - 2);
    rig.tongue.position.z = 0.38 + Math.max(0, flick) * 0.46;
    rig.tongue.rotation.y = Math.sin(time * 28) * 0.22;
  }

  const jawOpenFactor = THREE.MathUtils.clamp(rig.jaw.rotation.x / 0.85, 0, 1);
  for (let i = 0; i < rig.jawTendons.length; i++) {
    const td = rig.jawTendons[i];
    td.visible = jawOpenFactor > 0.1;
    td.scale.set(1, 0.4 + jawOpenFactor * 1.15, 0.85 + jawOpenFactor * 0.3);
    td.rotation.x = -0.18 - rig.jaw.rotation.x * 0.42;
  }

  // Water surface wake ring + V-shaped surging bow-wave
  const wakePhase = (time * (isChasing ? 3.2 : 0.75)) % 1;
  const wakeScale = rig.scale * (1.05 + wakePhase * (isChasing ? 1.85 : 0.85));
  rig.wakeRing.position.set(0, waterY - headWorldPos.y + 0.06, 0);
  rig.wakeRing.scale.setScalar(wakeScale);
  (rig.wakeRing.material as THREE.MeshBasicMaterial).opacity =
    (1 - wakePhase) * (0.26 + aggro * 0.52);

  rig.bowWake.position.set(
    -Math.sin(headYaw) * 1.6 * rig.scale,
    waterY - headWorldPos.y + 0.07,
    -Math.cos(headYaw) * 1.6 * rig.scale
  );
  rig.bowWake.rotation.y = headYaw;
  (rig.bowWake.material as THREE.MeshBasicMaterial).opacity = isChasing
    ? 0.42 + Math.sin(time * 18) * 0.08
    : 0.08;
}

export function attachPreyToSerpentMouth(
  monsterRig: MonsterRig,
  preyRig: PlayerRig,
  eatProgress: number,
  time: number,
  dt: number,
  startWorldPos?: THREE.Vector3 | null,
  startYaw = 0
): void {
  const u = THREE.MathUtils.clamp(eatProgress, 0, 1);
  monsterRig.root.updateMatrixWorld(true);
  monsterRig.headGroup.matrixWorld.decompose(_tmpPreyWorldPos, _tmpPreyHeadQuat, _tmpPreyHeadScale);

  // Slide prey from front jaws into throat along headGroup's local -Z axis
  let localZ = 0.08;
  if (u < 0.16) {
    localZ = THREE.MathUtils.lerp(0.42, -0.08, THREE.MathUtils.smoothstep(u, 0, 0.16));
  } else if (u < 0.36) {
    localZ = THREE.MathUtils.lerp(-0.08, -0.22, THREE.MathUtils.smoothstep(u, 0.16, 0.36));
  } else if (u < 0.88) {
    const p = (u - 0.36) / 0.52;
    const gulpStep = Math.sin(p * Math.PI * 2.0) * 0.05;
    localZ = THREE.MathUtils.lerp(-0.22, -0.68, THREE.MathUtils.smoothstep(p, 0, 1)) - Math.max(0, gulpStep);
  } else {
    localZ = THREE.MathUtils.lerp(-0.68, -0.18, THREE.MathUtils.smoothstep(u, 0.88, 1.0));
  }

  const jawDrop = THREE.MathUtils.clamp(monsterRig.jaw.rotation.x, 0, 1.15);
  const localY = -0.04 - jawDrop * 0.19;
  const struggleX = u < 0.55 ? Math.sin(time * 26) * 0.035 * (1 - u) : 0;

  _tmpPreyLocal.set(struggleX, localY, localZ);
  _tmpPreyLocal.applyMatrix4(monsterRig.headGroup.matrixWorld);

  // Align prey torso inside mouth cavity: feet toward throat (-Z), head/visor facing upward & outward (+Z/+Y)
  _tmpPreyWorldQuat.copy(_tmpPreyHeadQuat).multiply(_tmpPreyBasisQuat);
  if (u < 0.55) {
    _tmpPreyEuler.set(0, Math.sin(time * 18) * 0.08 * (1 - u), Math.cos(time * 22) * 0.09 * (1 - u));
    _tmpPreyTiltQuat.setFromEuler(_tmpPreyEuler);
    _tmpPreyWorldQuat.multiply(_tmpPreyTiltQuat);
  }

  // Blend smoothly from victim's initial water catch position/rotation over the first 0.16s so there is zero pop
  const grabBlend = THREE.MathUtils.smoothstep(u, 0, 0.16);
  if (startWorldPos && grabBlend < 1) {
    _tmpPreyWorldPos.lerpVectors(startWorldPos, _tmpPreyLocal, grabBlend);
    _tmpPreyEuler.set(0, startYaw, 0);
    _tmpPreyStartQuat.setFromEuler(_tmpPreyEuler);
    preyRig.root.quaternion.copy(_tmpPreyStartQuat).slerp(_tmpPreyWorldQuat, grabBlend);
  } else {
    _tmpPreyWorldPos.copy(_tmpPreyLocal);
    preyRig.root.quaternion.copy(_tmpPreyWorldQuat);
  }
  preyRig.root.position.copy(_tmpPreyWorldPos);

  // Keep player proportions consistent at grab, then tuck/taper smoothly ONLY deep inside the throat
  const baseScale = Math.min(1.0, 0.88 * Math.max(0.85, monsterRig.scale));
  const throatShrink = 1 - THREE.MathUtils.smoothstep(u, 0.58, 0.93) * 0.93;
  const finalScale = Math.max(0.05, THREE.MathUtils.lerp(1.0, baseScale, grabBlend) * throatShrink);
  preyRig.root.scale.setScalar(finalScale);

  // Pose limbs: desperate reach/flail on grab, folding legs & arms inward so nothing clips through jaws/skull
  const k = Math.min(1, dt * 22);
  const tuck = THREE.MathUtils.smoothstep(u, 0.2, 0.72);
  const flail = (1 - tuck) * Math.sin(time * 24);

  preyRig.hips.position.y = THREE.MathUtils.lerp(preyRig.hips.position.y, 0.92, k);
  preyRig.torso.rotation.x = THREE.MathUtils.lerp(preyRig.torso.rotation.x, 0.14 * (1 - tuck), k);
  preyRig.torso.rotation.y = THREE.MathUtils.lerp(preyRig.torso.rotation.y, flail * 0.18, k);
  preyRig.headGroup.rotation.x = THREE.MathUtils.lerp(preyRig.headGroup.rotation.x, -0.25 + flail * 0.1, k);

  // Arms reach upward/forward briefly, then press tight against sides as swallowed
  preyRig.leftArm.rotation.x = THREE.MathUtils.lerp(preyRig.leftArm.rotation.x, THREE.MathUtils.lerp(-1.2 + flail * 0.45, -0.15, tuck), k);
  preyRig.rightArm.rotation.x = THREE.MathUtils.lerp(preyRig.rightArm.rotation.x, THREE.MathUtils.lerp(-1.1 - flail * 0.45, -0.15, tuck), k);
  preyRig.leftArm.rotation.z = THREE.MathUtils.lerp(preyRig.leftArm.rotation.z, THREE.MathUtils.lerp(0.32, 0.04, tuck), k);
  preyRig.rightArm.rotation.z = THREE.MathUtils.lerp(preyRig.rightArm.rotation.z, THREE.MathUtils.lerp(-0.32, -0.04, tuck), k);
  preyRig.leftForearm.rotation.x = THREE.MathUtils.lerp(preyRig.leftForearm.rotation.x, THREE.MathUtils.lerp(-0.45, -1.1, tuck), k);
  preyRig.rightForearm.rotation.x = THREE.MathUtils.lerp(preyRig.rightForearm.rotation.x, THREE.MathUtils.lerp(-0.45, -1.1, tuck), k);

  // Knees flex neatly inside jaw/palate space so legs never poke behind the serpent's skull
  preyRig.leftLeg.rotation.x = THREE.MathUtils.lerp(preyRig.leftLeg.rotation.x, -0.52 + flail * 0.18, k);
  preyRig.rightLeg.rotation.x = THREE.MathUtils.lerp(preyRig.rightLeg.rotation.x, -0.48 - flail * 0.18, k);
  preyRig.leftShin.rotation.x = THREE.MathUtils.lerp(preyRig.leftShin.rotation.x, 1.05, k);
  preyRig.rightShin.rotation.x = THREE.MathUtils.lerp(preyRig.rightShin.rotation.x, 1.05, k);

  const headBaseY = 0.09 + 0.54 * Math.cos(preyRig.torso.rotation.x);
  const headBaseZ = 0.54 * Math.sin(preyRig.torso.rotation.x);
  preyRig.lampAnchor.position.set(0, preyRig.hips.position.y + headBaseY, headBaseZ);
  preyRig.lampAnchor.rotation.set(preyRig.torso.rotation.x + preyRig.headGroup.rotation.x, preyRig.torso.rotation.y, 0);
}

export interface CheckpointVisual {
  group: THREE.Group;
  ring: THREE.Mesh;
  beaconMat: THREE.MeshStandardMaterial;
  lightColor: THREE.Color;
  activated: boolean;
}

export function createCheckpointVisual(pos: [number, number, number]): CheckpointVisual {
  const group = new THREE.Group();
  group.position.set(pos[0], pos[1], pos[2]);
  const props = getPropSharedPool();

  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xebb144,
    emissive: 0xd99626,
    emissiveIntensity: 1.7,
    roughness: 0.16,
  });

  // Heavy industrial octagonal anchor base + stainless inner ring
  const basePlate = new THREE.Mesh(props.cpBasePlateGeo, props.cpBaseMat);
  basePlate.position.y = 0.06;
  basePlate.receiveShadow = true;
  group.add(basePlate);

  const innerRing = new THREE.Mesh(props.cpInnerRingGeo, props.cpCollarMat);
  innerRing.position.y = 0.14;
  group.add(innerRing);

  // Corner anchor struts around pad
  for (let i = 0; i < 4; i++) {
    const ang = (i * Math.PI) / 2 + Math.PI / 4;
    const strut = new THREE.Mesh(props.cpStrutGeo, props.cpCollarMat);
    strut.position.set(Math.cos(ang) * 0.66, 0.26, Math.sin(ang) * 0.66);
    strut.rotation.set(Math.sin(ang) * 0.25, 0, -Math.cos(ang) * 0.25);
    group.add(strut);
  }

  const ring = new THREE.Mesh(props.cpRingGeo, beaconMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.9;
  group.add(ring);

  const core = new THREE.Mesh(props.cpCoreGeo, beaconMat);
  core.position.y = 0.9;
  group.add(core);

  return { group, ring, beaconMat, lightColor: new THREE.Color(0xebb144), activated: false };
}

export function createExitGateMesh(pos: [number, number, number], size: [number, number, number]): THREE.Group {
  const group = new THREE.Group();
  group.position.set(pos[0], pos[1], pos[2]);
  const props = getPropSharedPool();

  const w = Math.max(3.0, size[0]);
  const h = Math.max(3.4, size[1]);
  const sizeKey = `${w.toFixed(2)}_${h.toFixed(2)}`;
  let sized = props.exitSizedGeos.get(sizeKey);
  if (!sized) {
    sized = {
      postGeo: tagShared(new THREE.BoxGeometry(0.42, h, 0.56)),
      footGeo: tagShared(new THREE.BoxGeometry(0.68, 0.22, 0.82)),
      ribGeo: tagShared(new THREE.BoxGeometry(0.48, 0.14, 0.62)),
      lintelGeo: tagShared(new THREE.BoxGeometry(w + 0.58, 0.48, 0.68)),
      upperBeamGeo: tagShared(new THREE.BoxGeometry(w + 0.3, 0.18, 0.74)),
      thresholdGeo: tagShared(new THREE.BoxGeometry(w - 0.35, 0.1, 0.52)),
      portalGeo: tagShared(new THREE.PlaneGeometry(w - 0.42, h - 0.26)),
    };
    props.exitSizedGeos.set(sizeKey, sized);
  }

  for (const side of [-1, 1] as const) {
    const px = side * w * 0.5;
    const post = new THREE.Mesh(sized.postGeo, props.exitFrameMat);
    post.position.set(px, h * 0.5, 0);
    post.castShadow = true;
    group.add(post);

    const foot = new THREE.Mesh(sized.footGeo, props.exitTrimSteelMat);
    foot.position.set(px, 0.11, 0);
    foot.receiveShadow = true;
    group.add(foot);

    for (const ry of [0.85, 1.75, 2.65]) {
      if (ry < h - 0.3) {
        const rib = new THREE.Mesh(sized.ribGeo, props.exitTrimSteelMat);
        rib.position.set(px, ry, 0);
        group.add(rib);
      }
    }

    // Side safety bollard emitter
    const bollard = new THREE.Mesh(props.exitBollardGeo, props.exitFrameMat);
    bollard.position.set(px + side * 0.55, 0.475, 0.45);
    group.add(bollard);
    const cap = new THREE.Mesh(props.exitCapGeo, props.exitGlowMat);
    cap.position.set(px + side * 0.55, 0.98, 0.45);
    group.add(cap);
  }

  // Heavy bulkhead lintel + upper bevel crown
  const lintel = new THREE.Mesh(sized.lintelGeo, props.exitFrameMat);
  lintel.position.set(0, h, 0);
  lintel.castShadow = true;
  group.add(lintel);

  const upperBeam = new THREE.Mesh(sized.upperBeamGeo, props.exitTrimSteelMat);
  upperBeam.position.set(0, h + 0.24, 0);
  group.add(upperBeam);

  // Glowing exit portal veil + recessed threshold sill
  const threshold = new THREE.Mesh(sized.thresholdGeo, props.exitTrimSteelMat);
  threshold.position.set(0, 0.05, 0);
  group.add(threshold);

  const portal = new THREE.Mesh(sized.portalGeo, props.exitGlowMat);
  portal.position.set(0, h * 0.5, 0);
  group.add(portal);

  // Overhead exit beacon bar + stainless housing
  const signHousing = new THREE.Mesh(props.exitSignHousingGeo, props.exitFrameMat);
  signHousing.position.set(0, h + 0.52, 0);
  group.add(signHousing);

  const sign = new THREE.Mesh(props.exitSignGeo, props.exitGlowMat);
  sign.position.set(0, h + 0.52, 0);
  group.add(sign);

  return group;
}
