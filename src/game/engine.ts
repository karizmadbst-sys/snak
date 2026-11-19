import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SoundEngine } from './audio';
import {
  animateMonsterRig,
  animatePlayerRig,
  attachPreyToSerpentMouth,
  CheckpointVisual,
  createCheckpointVisual,
  createExitGateMesh,
  createMonsterRig,
  createNameplateSprite,
  createPlayerRig,
  disposeEntityResources,
  MonsterRig,
  PlayerAnimState,
  PlayerRig,
  resetSerpentTrail,
  setEntityQualityTier,
  syncSerpentBones,
} from './entities';
import { LEVELS } from './levels';
import {
  computeSerpentSteerAngle,
  resetSerpentNavProgress,
  resolvePatrolTarget,
  selectClosestPatrolWaypoint,
  type SerpentNavState,
  updateSerpentProgressAndYaw,
} from './serpentNav';
import { LevelSpatialGrid } from './spatialGrid';
import { createProceduralTextures, TextureBundle } from './textures';
import {
  ActiveQualityTier,
  GamePhase,
  GameSettings,
  HudSnapshot,
  LevelDef,
  normalizeQualityPreset,
  PlatformDef,
} from './types';
import {
  EAT_DURATION_MS,
  PUSH_COOLDOWN_MS,
  PUSH_FORCE_HORIZ,
  PUSH_FORCE_LIFT_Y,
  PUSH_RECOVERY_MS,
  type ClientPlayerInputPacket,
  type ClientPushPacket,
  type GamePlayerEvent,
  type MonsterNetState,
  type PlayerNetState,
  type WorldSyncPayload,
} from '../multiplayer/types';
import { selectPushTarget, type PushCandidate } from '../multiplayer/pushPhysics';

// Reusable module-scope math objects for zero per-frame GC
const _vForward = new THREE.Vector3();
const _vRight = new THREE.Vector3();
const _vMove = new THREE.Vector3();
const _vCamTarget = new THREE.Vector3();
const _vCamPos = new THREE.Vector3();
const _vPlayerPos = new THREE.Vector3();
const _vDelta = new THREE.Vector3();
const _vSegWorld = new THREE.Vector3();
const _vPrevFeet = new THREE.Vector3();
const _vLocal = new THREE.Vector3();
const _vLocalPrev = new THREE.Vector3();
const _vAxisX = new THREE.Vector3();
const _vAxisY = new THREE.Vector3();
const _vAxisZ = new THREE.Vector3();
const _vBestNormal = new THREE.Vector3();
const _vCandNormal = new THREE.Vector3();
const _qTmp = new THREE.Quaternion();
const _mSplash = new THREE.Matrix4();
const _vSplashScale = new THREE.Vector3();
const _qIdentity = new THREE.Quaternion();
const _pickedLights: number[] = [];
const _nearPlatforms: RuntimePlatform[] = [];
const _nearWalls: RuntimeWall[] = [];
const _vMonsterVel = new THREE.Vector3();
const _vLookAhead = new THREE.Vector3();
const _vEatHeadPos = new THREE.Vector3();
const _pushCandidates: PushCandidate[] = [];
const _seenRemoteIds = new Set<string>();
const _nearPlatIdx: number[] = [];
const _nearWallIdx: number[] = [];
const _camWallIdx: number[] = [];
const _mBake = new THREE.Matrix4();
const _qBake = new THREE.Quaternion();
const _sBake = new THREE.Vector3(1, 1, 1);
const _pBake = new THREE.Vector3();
const _eBake = new THREE.Euler(0, 0, 0, 'YXZ');
const _monsterNavScratch: SerpentNavState = {
  x: 0,
  z: 0,
  yaw: 0,
  velX: 0,
  velZ: 0,
  wpIndex: 0,
  waypoints: [],
  avoidDir: 1,
  avoidTimer: 0,
  stuckTimer: 0,
  navBestDist: Infinity,
  navStallTimer: 0,
  navAnchorX: 0,
  navAnchorZ: 0,
  navAnchorTimer: 0,
  navTurnAccum: 0,
};
const EAT_DURATION_SEC = EAT_DURATION_MS / 1000;
const CHUNK_Z_SPAN = 36;

interface RuntimePlatform {
  def: PlatformDef;
  mesh: THREE.Object3D;
  material: THREE.MeshStandardMaterial;
  baseColorHex: number;
  boundRadiusXZ: number;
  currentPos: THREE.Vector3;
  prevPos: THREE.Vector3;
  currentQuat: THREE.Quaternion;
  prevQuat: THREE.Quaternion;
  invQuat: THREE.Quaternion;
  prevInvQuat: THREE.Quaternion;
  isRotated: boolean;
  state: 'solid' | 'warning' | 'gone';
  stateTimer: number;
}

interface RuntimeWall {
  centerX: number;
  centerZ: number;
  boundRadiusXZ: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

interface RuntimeMonster {
  id: string;
  rig: MonsterRig;
  pos: THREE.Vector3;
  yaw: number;
  targetYaw: number;
  targetUserId: string | null;
  waypoints: [number, number][];
  wpIndex: number;
  patrolSpeed: number;
  chaseSpeed: number;
  detectionRadius: number;
  waterDetectionRadius: number;
  scale: number;
  alert: 'calm' | 'searching' | 'chasing';
  searchTarget: THREE.Vector3;
  searchTimer: number;
  velX: number;
  velZ: number;
  avoidDir: -1 | 1;
  avoidTimer: number;
  stuckTimer: number;
  navBestDist: number;
  navStallTimer: number;
  navAnchorX: number;
  navAnchorZ: number;
  navAnchorTimer: number;
  navTurnAccum: number;
  emerged: boolean;
  wakeSplashTimer: number;
  eatingUserId: string | null;
  eatingTimer: number;
  eatingProgress: number;
  eatingPreyStartPos: THREE.Vector3;
  eatingPreyStartYaw: number;
  eatingGulpStage: number;
}

interface SplashParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

export interface EngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onPhaseChange: (phase: GamePhase, extra?: { deathReason?: 'caught' | 'timeout'; elapsed?: number }) => void;
  onMultiplayerTick?: (packet: ClientPlayerInputPacket) => void;
  onMultiplayerPush?: (packet: ClientPushPacket) => void;
  onMultiplayerCaught?: () => void;
  onMultiplayerEscaped?: () => void;
}

interface RemotePlayerVisual {
  userId: string;
  username: string;
  avatarColor: string;
  rig: PlayerRig;
  nameplate: THREE.Sprite;
  pos: THREE.Vector3;
  targetPos: THREE.Vector3;
  velX: number;
  velY: number;
  velZ: number;
  lastNetTimeMs: number;
  yaw: number;
  targetYaw: number;
  animState: PlayerAnimState;
  horizSpeed: number;
  inWater: boolean;
  alive: boolean;
  escaped: boolean;
  pushRecoveryTimer: number;
  pushCand: PushCandidate;
}

function detectSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

function shortestAngleDiff(current: number, target: number): number {
  let diff = (target - current) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

export class PoolGameEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  public sound: SoundEngine;

  private isSoftwareGl: boolean;
  private isTouchDevice: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private textures: TextureBundle;
  private envRT: THREE.WebGLRenderTarget | null = null;

  private levelGroup: THREE.Group;
  private currentLevel: LevelDef = LEVELS[0];
  private phase: GamePhase = 'menu';
  private settings: GameSettings;

  // Dynamic level objects
  private platforms: RuntimePlatform[] = [];
  private dynamicPlatforms: RuntimePlatform[] = [];
  private walls: RuntimeWall[] = [];
  private spatialGrid: LevelSpatialGrid | null = null;
  private checkpoints: CheckpointVisual[] = [];
  private monsters: RuntimeMonster[] = [];
  private keyLight: THREE.DirectionalLight | null = null;
  private pointLightPool: THREE.PointLight[] = [];
  private activePointLightLimit = 4;
  private levelLights: Array<{
    x: number;
    y: number;
    z: number;
    color: THREE.Color;
    baseIntensity: number;
    flickering: boolean;
    seed: number;
    checkpointIdx?: number;
  }> = [];
  private waterMesh: THREE.Mesh | null = null;
  private waterMat: THREE.MeshStandardMaterial | null = null;
  private uCausticTime = { value: 0 };
  private uCausticEnabled = { value: 1.0 };
  private uCausticRangeSq = { value: 55 * 55 };
  private baseFogColor = new THREE.Color('#667478');
  private underwaterFogColor = new THREE.Color('#1a353d');
  private exitGroup: THREE.Group | null = null;
  private mistMesh: THREE.InstancedMesh | null = null;
  private coneMesh: THREE.InstancedMesh | null = null;
  private levelDisposables: Array<{ dispose: () => void }> = [];

  // Instanced splash particle pool (1 draw call for up to 420 droplets)
  private splashPool: SplashParticle[] = [];
  private splashMaxActive = 240;
  private splashGeo: THREE.SphereGeometry;
  private splashMat: THREE.MeshBasicMaterial;
  private splashMesh: THREE.InstancedMesh;

  // Player state
  private playerRig: PlayerRig;
  private playerPos = new THREE.Vector3(0, 1.2, 3);
  private playerVel = new THREE.Vector3(0, 0, 0);
  private playerYaw = Math.PI;
  private grounded = false;
  private stoodPlatform: RuntimePlatform | null = null;
  private inWater = false;
  private wasInWater = false;
  private waterJumpTimer = 0;
  private waterJumpCooldown = 0;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private stamina = 100;
  private exhausted = false;
  private stepTimer = 0;
  private swimSplashTimer = 0;
  private activeSpawn = new THREE.Vector3(0, 1.2, 3);
  private activeCheckpointIndex = 0;
  private checkpointNotice: string | null = null;
  private checkpointNoticeTimer = 0;

  // Camera state
  private camYaw = 0; // 0 looks toward -Z
  private camPitch = 0.24;
  private camShake = 0;
  private isDraggingLook = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private isPointerLocked = false;

  // Input state (continuous held + mobile virtual joystick)
  private heldKeys = new Set<string>();
  private virtualMove = { x: 0, y: 0 }; // x: -1..1, y: -1..1 (+y = forward)
  private virtualRun = false;
  private virtualAutoRun = false;

  // Timing & game loop
  private rafId = 0;
  private timerId = 0;
  private pendingSync: WebGLSync | null = null;
  private disposed = false;
  private lastTimeMs = 0;
  private simTime = 0;
  private platformTime = 0;
  private levelTimeRemaining = 75;
  private levelTimeElapsed = 0;
  private jumpscareTimer = 0;
  private jumpscareMonster: RuntimeMonster | null = null;
  private deathReason: 'caught' | 'timeout' | null = null;
  private eatingCamSide: 1 | -1 = 1;

  // Adaptive performance tracking
  private activeQuality: ActiveQualityTier = 'standard';
  private fpsSamples: number[] = [];
  private currentFps = 60;
  private qualityEvalTimer = 0;
  private qualityCooldownTimer = 0;
  private slowFrameCount = 0;
  private highFpsStreak = 0;
  private renderFrameIdx = 0;
  private hudEmitTimer = 0;
  private lastHudSnap = {
    levelId: -1,
    timeRemaining: -1,
    timeElapsed: -1,
    stamina: -1,
    inWater: false,
    underwater: false,
    waterJumpCooldown: -1,
    monsterDist: -1,
    monsterAlert: '',
    checkpointIndex: -1,
    totalCheckpoints: -1,
    checkpointNotice: null as string | null,
    activeQuality: '',
    fps: -1,
    isPointerLocked: false,
    deathReason: null as string | null,
    isMultiplayer: false,
    pushCooldown: -1,
    canPushTarget: false,
  };

  // Multiplayer state
  private isMultiplayer = false;
  private mpLocalUserId: string | null = null;
  private mpLocalAlive = true;
  private mpLocalBeingEaten = false;
  private mpLocalEscaped = false;
  private mpLastAnimState: PlayerAnimState = 'idle';
  private mpLastHorizSpeed = 0;
  private mpSendTimer = 0;
  private mpLastSentTime = 0;
  private mpLastSentX = NaN;
  private mpLastSentY = NaN;
  private mpLastSentZ = NaN;
  private mpLastSentYaw = NaN;
  private mpLastSentInWater = false;
  private mpLastSentCp = -1;
  private mpLastSentAnim: PlayerAnimState = 'idle';
  private remotePlayers = new Map<string, RemotePlayerVisual>();
  private mpTriggeredDeathIds = new Set<string>();
  private pushCooldownTimer = 0;
  private pushRecoveryTimer = 0;
  private pushStaggerTimer = 0;
  private canPushTargetCache = false;

  constructor(container: HTMLElement, settings: GameSettings, callbacks: EngineCallbacks) {
    this.container = container;
    this.settings = { ...settings, quality: normalizeQualityPreset(settings.quality) };
    this.callbacks = callbacks;
    this.sound = new SoundEngine();
    this.sound.setVolumes(settings.masterVolume, settings.musicVolume, settings.sfxVolume, settings.muted);

    this.isSoftwareGl = detectSoftwareWebGL();
    this.isTouchDevice =
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      Boolean(window.matchMedia?.('(pointer: coarse)')?.matches);
    this.activeQuality =
      this.settings.quality === 'auto'
        ? this.detectInitialQuality()
        : this.isSoftwareGl
          ? 'smooth'
          : this.settings.quality;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl && !this.isTouchDevice && this.activeQuality !== 'smooth',
      powerPreference: 'high-performance',
    });
    this.renderer.debug.checkShaderErrors = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      68,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.1,
      240
    );

    // Mandatory procedural studio environment map on every device
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envRT = pmremGenerator.fromScene(roomEnv, 0.04);
    this.scene.environment = this.envRT.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso, this.isSoftwareGl || this.isTouchDevice);

    this.levelGroup = new THREE.Group();
    this.scene.add(this.levelGroup);

    this.playerRig = createPlayerRig(this.textures);
    this.scene.add(this.playerRig.root);

    // Pre-allocate high-capacity instanced splash pool (1 draw call instead of 420 meshes)
    this.splashGeo = new THREE.SphereGeometry(0.095, 6, 5);
    this.splashMat = new THREE.MeshBasicMaterial({
      color: 0xd6eef4,
      transparent: true,
      opacity: 0.82,
    });
    this.splashMesh = new THREE.InstancedMesh(this.splashGeo, this.splashMat, 420);
    this.splashMesh.count = 0;
    this.splashMesh.frustumCulled = false;
    this.scene.add(this.splashMesh);
    for (let i = 0; i < 420; i++) {
      this.splashPool.push({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.5,
      });
    }

    this.bindEvents();
    this.applyQualityToRenderer();
    this.loadLevel(1, 'menu');
    this.lastTimeMs = performance.now();
    this.scheduleNextTick(true);
  }

  private detectInitialQuality(): ActiveQualityTier {
    if (this.isSoftwareGl) return 'smooth';
    const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
    const cores = navigator.hardwareConcurrency ?? 8;
    if (this.isTouchDevice) {
      return cores <= 4 || mem <= 3 ? 'smooth' : 'standard';
    }
    return cores <= 4 && mem <= 4 ? 'standard' : 'ultra';
  }

  private applyQualityToRenderer(): void {
    const q: ActiveQualityTier = this.isSoftwareGl ? 'smooth' : this.activeQuality;
    const dpr = window.devicePixelRatio || 1;
    let targetPixelRatio = 1;
    let shadowEnabled = false;
    let shadowType: THREE.ShadowMapType = THREE.PCFShadowMap;
    let farPlane = 145;
    let aniso = 1;
    let waterEnv = 0.85;

    if (q === 'ultra') {
      targetPixelRatio = Math.min(dpr, this.isTouchDevice ? 1.5 : 2);
      shadowEnabled = !this.isSoftwareGl;
      shadowType = THREE.PCFSoftShadowMap;
      farPlane = 360;
      this.splashMaxActive = 420;
      this.uCausticEnabled.value = 1;
      this.uCausticRangeSq.value = 90 * 90;
      this.activePointLightLimit = this.isSoftwareGl ? 2 : 6;
      aniso = 8;
      waterEnv = 1.68;
    } else if (q === 'standard') {
      targetPixelRatio = Math.min(dpr, this.isTouchDevice ? 1.25 : 1.5);
      shadowEnabled = !this.isSoftwareGl;
      shadowType = THREE.PCFShadowMap;
      farPlane = 225;
      this.splashMaxActive = 240;
      this.uCausticEnabled.value = 1;
      this.uCausticRangeSq.value = 55 * 55;
      this.activePointLightLimit = this.isSoftwareGl ? 2 : 4;
      aniso = 4;
      waterEnv = 1.45;
    } else {
      targetPixelRatio = 1;
      shadowEnabled = false;
      farPlane = 145;
      this.splashMaxActive = 120;
      this.uCausticEnabled.value = 0;
      this.activePointLightLimit = 2;
      aniso = 1;
      waterEnv = 0.85;
    }

    if (this.isSoftwareGl) {
      targetPixelRatio = 1;
      shadowEnabled = false;
      this.uCausticEnabled.value = 0;
    }

    this.renderer.setPixelRatio(targetPixelRatio);
    this.renderer.shadowMap.enabled = shadowEnabled;
    if (shadowEnabled) {
      this.renderer.shadowMap.type = shadowType;
    }
    this.renderer.setSize(
      this.container.clientWidth || window.innerWidth,
      this.container.clientHeight || window.innerHeight
    );

    if (this.camera && this.camera.far !== farPlane) {
      this.camera.far = farPlane;
      this.camera.updateProjectionMatrix();
    }
    if (this.textures) {
      this.textures.setAnisotropy(aniso);
      setEntityQualityTier(this.textures, q);
    }
    if (this.playerRig) {
      this.playerRig.setShadowDetail(q);
    }
    for (const rp of this.remotePlayers.values()) {
      rp.rig.setShadowDetail(q);
    }
    for (const m of this.monsters) {
      m.rig.setShadowDetail(q);
    }
    if (this.waterMat) {
      this.waterMat.envMapIntensity = waterEnv;
    }
    if (this.mistMesh) {
      this.mistMesh.visible = q !== 'smooth' && !this.isSoftwareGl;
    }
    if (this.coneMesh) {
      this.coneMesh.visible = q !== 'smooth' && !this.isSoftwareGl;
    }
    if (this.keyLight) {
      const wantShadow = shadowEnabled;
      this.keyLight.castShadow = wantShadow;
      if (wantShadow) {
        const sMap = q === 'ultra' ? (this.isTouchDevice ? 1024 : 2048) : 1024;
        const d = q === 'ultra' ? 52 : 38;
        if (this.keyLight.shadow.mapSize.width !== sMap) {
          this.keyLight.shadow.mapSize.set(sMap, sMap);
          this.keyLight.shadow.map?.dispose();
          this.keyLight.shadow.map = null;
        }
        if (this.keyLight.shadow.camera.right !== d) {
          this.keyLight.shadow.camera.left = -d;
          this.keyLight.shadow.camera.right = d;
          this.keyLight.shadow.camera.top = d;
          this.keyLight.shadow.camera.bottom = -d;
          this.keyLight.shadow.camera.updateProjectionMatrix();
        }
      }
    }
  }

  public updateSettings(next: GameSettings): void {
    const normalizedQuality = normalizeQualityPreset(next.quality);
    this.settings = { ...next, quality: normalizedQuality };
    this.sound.setVolumes(next.masterVolume, next.musicVolume, next.sfxVolume, next.muted);
    if (!this.isSoftwareGl) {
      const target = normalizedQuality === 'auto' ? this.detectInitialQuality() : normalizedQuality;
      if (target !== this.activeQuality) {
        this.activeQuality = target;
        this.applyQualityToRenderer();
        this.emitHud(true);
      }
    }
  }

  public setVirtualInput(moveX: number, moveY: number, running: boolean): void {
    this.virtualMove.x = THREE.MathUtils.clamp(moveX, -1, 1);
    this.virtualMove.y = THREE.MathUtils.clamp(moveY, -1, 1);
    this.virtualRun = running;
  }

  public setVirtualAutoRun(enabled: boolean): void {
    this.virtualAutoRun = enabled;
  }

  public triggerJump(): void {
    this.sound.unlock();
    if (this.phase !== 'playing') return;
    this.jumpBufferTimer = 0.14;
  }

  public rotateCameraByDelta(dx: number, dy: number): void {
    const sens = 0.0028 * this.settings.mouseSensitivity;
    const ySign = this.settings.invertY ? -1 : 1;
    this.camYaw -= dx * sens;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * sens * ySign, -0.45, 1.05);
  }

  public setPhase(phase: GamePhase): void {
    this.phase = phase;
    if (phase === 'paused' || phase === 'menu' || phase === 'gameover' || phase === 'victory') {
      this.heldKeys.clear();
      this.virtualMove.x = 0;
      this.virtualMove.y = 0;
      this.virtualRun = false;
      this.virtualAutoRun = false;
      if (document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock();
      }
    }
    this.emitHud(true);
  }

  public startLevel(levelId: number): void {
    this.sound.unlock();
    this.isMultiplayer = false;
    this.mpLocalUserId = null;
    this.mpLocalAlive = true;
    this.mpLocalBeingEaten = false;
    this.mpLocalEscaped = false;
    this.mpTriggeredDeathIds.clear();
    this.pushCooldownTimer = 0;
    this.pushRecoveryTimer = 0;
    this.pushStaggerTimer = 0;
    this.canPushTargetCache = false;
    this.playerRig.pushAnimTimer = 0;
    this.playerRig.pushedAnimTimer = 0;
    this.playerRig.root.scale.setScalar(1);
    this.playerRig.root.rotation.set(0, this.playerYaw, 0);
    this.playerRig.setVisible(true);
    this.virtualMove.x = 0;
    this.virtualMove.y = 0;
    this.virtualRun = false;
    this.virtualAutoRun = false;
    this.loadLevel(levelId, 'playing');
  }

  public startMultiplayerLevel(
    levelId: number,
    localUserId: string,
    initialPlayers: PlayerNetState[],
    initialMonsters: MonsterNetState[],
    initialElapsedSec = 0
  ): void {
    this.sound.unlock();
    this.isMultiplayer = true;
    this.mpLocalUserId = localUserId;
    this.mpLocalAlive = true;
    this.mpLocalBeingEaten = false;
    this.mpLocalEscaped = false;
    this.mpTriggeredDeathIds.clear();
    this.mpLastAnimState = 'idle';
    this.mpLastHorizSpeed = 0;
    this.mpSendTimer = 0;
    this.pushCooldownTimer = 0;
    this.pushRecoveryTimer = 0;
    this.pushStaggerTimer = 0;
    this.canPushTargetCache = false;
    this.playerRig.pushAnimTimer = 0;
    this.playerRig.pushedAnimTimer = 0;
    this.playerRig.root.scale.setScalar(1);
    this.playerRig.root.rotation.set(0, this.playerYaw, 0);
    this.virtualMove.x = 0;
    this.virtualMove.y = 0;
    this.virtualRun = false;
    this.virtualAutoRun = false;
    this.playerRig.setVisible(true);

    this.loadLevel(levelId, 'playing', true);

    this.platformTime = Math.max(0, Number.isFinite(initialElapsedSec) ? initialElapsedSec : 0);
    this.updatePlatforms(0);
    for (const p of this.platforms) {
      p.prevPos.copy(p.currentPos);
      p.prevQuat.copy(p.currentQuat);
      p.prevInvQuat.copy(p.invQuat);
    }

    const localInit = initialPlayers.find((p) => p.userId === localUserId);
    if (localInit) {
      this.playerPos.set(localInit.x, localInit.y, localInit.z);
      this.activeSpawn.copy(this.playerPos);
      this.playerRig.root.position.copy(this.playerPos);
    }

    for (const p of initialPlayers) {
      if (p.userId !== localUserId) {
        this.upsertRemotePlayer(p);
      }
    }
    this.syncMonstersFromServer(initialMonsters);
    for (const m of this.monsters) {
      m.pos.copy(m.searchTarget);
      m.yaw = m.targetYaw;
      m.rig.root.position.copy(m.pos);
      m.rig.root.rotation.y = 0;
      resetSerpentTrail(m.rig, m.pos, m.yaw);
    }
    this.mpLastSentTime = 0;
    this.mpLastSentX = NaN;
    this.mpLastSentY = NaN;
    this.mpLastSentZ = NaN;
    this.prewarmSceneShaders();
    this.lastTimeMs = performance.now();
    this.emitHud(true);
  }

  public exitMultiplayerMode(): void {
    this.isMultiplayer = false;
    this.mpLocalUserId = null;
    this.mpLocalAlive = true;
    this.mpLocalBeingEaten = false;
    this.mpLocalEscaped = false;
    this.mpTriggeredDeathIds.clear();
    this.pushCooldownTimer = 0;
    this.pushRecoveryTimer = 0;
    this.pushStaggerTimer = 0;
    this.canPushTargetCache = false;
    this.playerRig.pushAnimTimer = 0;
    this.playerRig.pushedAnimTimer = 0;
    this.playerRig.root.scale.setScalar(1);
    this.playerRig.root.rotation.set(0, this.playerYaw, 0);
    this.jumpscareMonster = null;
    this.jumpscareTimer = 0;
    this.deathReason = null;
    this.playerRig.setVisible(true);
    this.clearRemotePlayers();
  }

  private findLocalPushCandidate() {
    if (!this.isMultiplayer || !this.mpLocalUserId || !this.mpLocalAlive || this.mpLocalBeingEaten || this.mpLocalEscaped) {
      return null;
    }
    _pushCandidates.length = 0;
    for (const rp of this.remotePlayers.values()) {
      if (!rp.alive || rp.escaped || rp.pushRecoveryTimer > 0 || this.isUserBeingEaten(rp.userId)) continue;
      rp.pushCand.x = rp.pos.x;
      rp.pushCand.y = rp.pos.y;
      rp.pushCand.z = rp.pos.z;
      _pushCandidates.push(rp.pushCand);
    }
    if (_pushCandidates.length === 0) return null;
    return selectPushTarget(
      this.currentLevel,
      {
        userId: this.mpLocalUserId,
        x: this.playerPos.x,
        y: this.playerPos.y,
        z: this.playerPos.z,
        yaw: this.playerYaw,
      },
      _pushCandidates,
      this.platformTime
    );
  }

  public triggerPush(): void {
    if (!this.isMultiplayer || this.phase !== 'playing' || !this.mpLocalAlive || this.mpLocalBeingEaten || this.mpLocalEscaped) {
      return;
    }
    if (this.pushCooldownTimer > 0) return;

    const candidate = this.findLocalPushCandidate();
    if (!candidate) return;

    this.pushCooldownTimer = PUSH_COOLDOWN_MS / 1000;
    this.playerRig.pushAnimTimer = 0.38;
    this.sound.playPush(1.0);
    this.callbacks.onMultiplayerPush?.({
      yaw: this.playerYaw,
      x: this.playerPos.x,
      y: this.playerPos.y,
      z: this.playerPos.z,
    });
    this.emitHud(true);
  }

  public handleMultiplayerPlayerEvent(ev: GamePlayerEvent): void {
    if (!this.isMultiplayer) return;
    if (ev.kind === 'eating_started') {
      this.handleMultiplayerEatingStarted(ev.userId, ev.x, ev.y, ev.z, ev.monsterId);
    } else if (ev.kind === 'caught') {
      this.handleMultiplayerCaught(ev.userId, ev.x, ev.y, ev.z, ev.monsterId);
    } else if (ev.kind === 'pushed') {
      this.handleMultiplayerPushed(ev);
    }
  }

  private handleMultiplayerPushed(ev: GamePlayerEvent): void {
    const dirX = Number.isFinite(ev.dirX) ? (ev.dirX as number) : 0;
    const dirZ = Number.isFinite(ev.dirZ) ? (ev.dirZ as number) : 1;
    const force = Number.isFinite(ev.force) ? (ev.force as number) : PUSH_FORCE_HORIZ;
    const liftY = Number.isFinite(ev.liftY) ? (ev.liftY as number) : PUSH_FORCE_LIFT_Y;

    if (ev.attackerUserId) {
      if (ev.attackerUserId === this.mpLocalUserId) {
        if (this.playerRig.pushAnimTimer <= 0.1) {
          this.playerRig.pushAnimTimer = 0.38;
        }
      } else {
        const attackerRp = this.remotePlayers.get(ev.attackerUserId);
        if (attackerRp) {
          attackerRp.rig.pushAnimTimer = 0.38;
        }
      }
    }

    if (ev.userId === this.mpLocalUserId) {
      if (!this.mpLocalAlive || this.mpLocalEscaped) return;
      this.playerVel.x = dirX * force;
      this.playerVel.z = dirZ * force;
      this.playerVel.y = Math.max(this.playerVel.y, liftY);
      this.grounded = false;
      this.stoodPlatform = null;
      this.coyoteTimer = 0;
      this.pushStaggerTimer = 0.42;
      this.pushRecoveryTimer = PUSH_RECOVERY_MS / 1000;
      this.playerRig.pushedAnimTimer = 0.45;
      this.camShake = Math.max(this.camShake, 0.36);
      this.sound.playPush(1.0);
      if (this.inWater) {
        this.spawnSplash(this.playerPos, 12, 1.2);
      }
      this.emitHud();
      return;
    }

    const targetRp = this.remotePlayers.get(ev.userId);
    if (targetRp) {
      targetRp.rig.pushedAnimTimer = 0.45;
      targetRp.pushRecoveryTimer = PUSH_RECOVERY_MS / 1000;
      const dist = this.playerPos.distanceTo(targetRp.pos);
      if (dist < 18 && ev.attackerUserId !== this.mpLocalUserId) {
        this.sound.playPush(Math.max(0.2, 1 - dist / 18) * 0.7);
      }
      if (targetRp.inWater) {
        this.spawnSplash(targetRp.pos, 10, 1.0);
      }
    }
  }

  private isUserBeingEaten(userId: string): boolean {
    for (let i = 0; i < this.monsters.length; i++) {
      if (this.monsters[i].eatingUserId === userId) return true;
    }
    return false;
  }

  private findClosestMonsterForCatch(refX: number, refZ: number, monsterId?: string): RuntimeMonster | null {
    if (monsterId) {
      const exact = this.monsters.find((m) => m.id === monsterId);
      if (exact) return exact;
    }
    let best: RuntimeMonster | null = null;
    let bestDist = Infinity;
    for (const m of this.monsters) {
      const d = Math.hypot(refX - m.pos.x, refZ - m.pos.z);
      if (d < bestDist) {
        bestDist = d;
        best = m;
      }
    }
    return best;
  }

  private chooseEatingCamSide(m: RuntimeMonster): 1 | -1 {
    const waterY = this.currentLevel.bounds.waterY;
    const b = this.currentLevel.bounds;
    const headX = m.pos.x + Math.sin(m.yaw) * 0.8 * m.scale;
    const headZ = m.pos.z + Math.cos(m.yaw) * 0.8 * m.scale;
    const headY = waterY + 1.55 * m.scale;
    const testSide = (side: 1 | -1): number => {
      const ang = m.yaw + side * 0.92;
      const dist = 5.0 * m.scale;
      const cx = THREE.MathUtils.clamp(headX + Math.sin(ang) * dist, b.minX + 0.45, b.maxX - 0.45);
      const cz = THREE.MathUtils.clamp(headZ + Math.cos(ang) * dist, b.minZ + 0.45, b.maxZ - 0.45);
      const cy = THREE.MathUtils.clamp(waterY + 2.4 * m.scale, b.floorY + 0.45, b.ceilingY - 0.45);
      const occ = this.computeCameraWallOcclusion(headX, headY, headZ, cx, cy, cz, 0.3);
      return occ * Math.hypot(cx - headX, cz - headZ);
    };
    return testSide(1) >= testSide(-1) ? 1 : -1;
  }

  private beginMonsterEatingSequence(
    m: RuntimeMonster,
    userId: string,
    preyX: number,
    preyY: number,
    preyZ: number,
    preyYaw: number,
    initialProgress = 0
  ): void {
    const waterY = this.currentLevel.bounds.waterY;
    const wasAlreadyEatingThis = m.eatingUserId === userId;
    m.alert = 'chasing';
    m.emerged = true;
    m.targetUserId = userId === '__local__' ? null : userId;
    m.eatingUserId = userId;

    if (!wasAlreadyEatingThis) {
      m.eatingProgress = THREE.MathUtils.clamp(initialProgress, 0, 0.98);
      m.eatingTimer = m.eatingProgress * EAT_DURATION_SEC;
      m.eatingPreyStartPos.set(preyX, preyY, preyZ);
      m.eatingPreyStartYaw = preyYaw;
      m.eatingGulpStage = m.eatingProgress >= 0.68 ? 2 : m.eatingProgress >= 0.42 ? 1 : 0;

      // Orient & place serpent smoothly at bite strike range facing victim
      const dxFace = preyX - m.pos.x;
      const dzFace = preyZ - m.pos.z;
      const dist = Math.hypot(dxFace, dzFace);
      if (dist > 0.05) {
        m.yaw = Math.atan2(dxFace, dzFace);
      }
      const idealDist = 1.08 * m.scale;
      if (dist > idealDist + 0.15) {
        const nx = Math.sin(m.yaw);
        const nz = Math.cos(m.yaw);
        m.pos.x = preyX - nx * idealDist;
        m.pos.z = preyZ - nz * idealDist;
        const r = 0.88 * m.scale;
        this.resolveCircleSolids(m.pos, r, waterY - 1.5, waterY + 4.2 * m.scale, r + 0.15, true);
      }
      m.pos.y = waterY - 0.14;
      m.velX = 0;
      m.velZ = 0;
    }
  }

  private handleMultiplayerEatingStarted(
    userId: string,
    x?: number,
    y?: number,
    z?: number,
    monsterId?: string
  ): void {
    const isLocal = userId === this.mpLocalUserId;
    const rp = !isLocal ? this.remotePlayers.get(userId) : null;
    const refX = x ?? (isLocal ? this.playerPos.x : rp?.pos.x ?? 0);
    const refY = y ?? (isLocal ? this.playerPos.y : rp?.pos.y ?? this.currentLevel.bounds.waterY);
    const refZ = z ?? (isLocal ? this.playerPos.z : rp?.pos.z ?? 0);
    const preyYaw = isLocal ? this.playerYaw : rp?.yaw ?? 0;

    const m = this.findClosestMonsterForCatch(refX, refZ, monsterId);
    if (m) {
      this.beginMonsterEatingSequence(m, userId, refX, refY, refZ, preyYaw, 0);
    }

    _vPlayerPos.set(refX, refY, refZ);
    this.spawnSplash(_vPlayerPos, isLocal ? 36 : 26, isLocal ? 2.6 : 2.0);

    if (isLocal) {
      if (!this.mpLocalAlive || this.mpLocalBeingEaten) return;
      this.mpLocalBeingEaten = true;
      this.playerRig.root.scale.setScalar(1);
      this.playerRig.setVisible(true);
      this.heldKeys.clear();
      this.virtualMove.x = 0;
      this.virtualMove.y = 0;
      this.virtualRun = false;
      this.virtualAutoRun = false;
      this.isDraggingLook = false;
      this.jumpBufferTimer = 0;
      try {
        if (document.pointerLockElement === this.renderer.domElement) {
          document.exitPointerLock();
        }
      } catch {
        // ignore pointer lock errors inside sandboxed iframes
      }

      this.sound.playEatingStrike(1.0);
      this.camShake = Math.max(this.camShake, 0.48);

      if (m) {
        this.eatingCamSide = this.chooseEatingCamSide(m);
        this.deathReason = 'caught';
        this.jumpscareMonster = m;
        this.jumpscareTimer = EAT_DURATION_SEC + 0.35;
        this.phase = 'jumpscare';
        this.sound.updateAtmosphere(this.simTime, 2, 'chasing', false, false, false);
        this.callbacks.onPhaseChange('jumpscare', { deathReason: 'caught' });
      }
      return;
    }

    if (rp) {
      rp.rig.root.visible = true;
      const dist = this.playerPos.distanceTo(rp.pos);
      if (dist < 28) {
        this.sound.playEatingStrike(Math.max(0.2, 1 - dist / 28) * 0.85);
      }
    }
  }

  private handleMultiplayerCaught(
    userId: string,
    x?: number,
    y?: number,
    z?: number,
    monsterId?: string
  ): void {
    if (this.mpTriggeredDeathIds.has(userId)) return;
    this.mpTriggeredDeathIds.add(userId);

    // Finalize any monster eating this victim now that eating is completed
    for (const m of this.monsters) {
      if (m.eatingUserId === userId || (monsterId && m.id === monsterId && m.eatingUserId === userId)) {
        m.eatingUserId = null;
        m.eatingProgress = -1;
        m.eatingTimer = 0;
      }
    }

    if (userId === this.mpLocalUserId) {
      const wasInEatingView = this.mpLocalBeingEaten && this.phase === 'jumpscare';
      this.mpLocalBeingEaten = false;
      if (this.mpLocalAlive) {
        this.mpLocalAlive = false;
        this.playerRig.setVisible(false);
        this.playerRig.root.scale.setScalar(1);
        this.playerRig.root.rotation.set(0, this.playerYaw, 0);
        this.spawnSplash(this.playerPos, 24, 1.8);
        this.heldKeys.clear();
        this.virtualMove.x = 0;
        this.virtualMove.y = 0;
        this.virtualRun = false;
        this.virtualAutoRun = false;
        this.isDraggingLook = false;
        this.jumpBufferTimer = 0;
        try {
          if (document.pointerLockElement === this.renderer.domElement) {
            document.exitPointerLock();
          }
        } catch {
          // ignore pointer lock errors inside sandboxed iframes
        }

        this.callbacks.onMultiplayerCaught?.();

        if (wasInEatingView) {
          // Eating already played cleanly -> transition directly to spectating teammates
          this.jumpscareMonster = null;
          this.jumpscareTimer = 0;
          this.phase = 'playing';
          this.callbacks.onPhaseChange('playing');
          this.emitHud();
        } else {
          // Fallback if caught arrived without eating_started (e.g. reconnect right at end)
          const refX = x ?? this.playerPos.x;
          const refZ = z ?? this.playerPos.z;
          const caughtMonster = this.findClosestMonsterForCatch(refX, refZ, monsterId);
          this.sound.playJumpscare();
          this.camShake = Math.max(this.camShake, 0.5);
          if (caughtMonster) {
            caughtMonster.alert = 'chasing';
            caughtMonster.emerged = true;
            this.eatingCamSide = this.chooseEatingCamSide(caughtMonster);
            this.deathReason = 'caught';
            this.jumpscareMonster = caughtMonster;
            this.jumpscareTimer = 0.65;
            this.phase = 'jumpscare';
            this.sound.updateAtmosphere(this.simTime, 2, 'chasing', false, false, false);
            this.callbacks.onPhaseChange('jumpscare', { deathReason: 'caught' });
          }
        }
      }
      return;
    }

    const rp = this.remotePlayers.get(userId);
    if (rp) {
      rp.alive = false;
      rp.rig.root.visible = false;
      rp.rig.root.scale.setScalar(1);
      rp.rig.root.rotation.set(0, rp.yaw, 0);
      rp.nameplate.visible = true;
    }
    const sx = x ?? rp?.pos.x;
    const sy = y ?? rp?.pos.y ?? this.currentLevel.bounds.waterY;
    const sz = z ?? rp?.pos.z;
    if (sx !== undefined && sz !== undefined) {
      _vPlayerPos.set(sx, sy, sz);
      this.spawnSplash(_vPlayerPos, 18, 1.5);
    }
  }

  public applyMultiplayerWorld(world: WorldSyncPayload): void {
    if (!this.isMultiplayer) return;
    this.levelTimeRemaining = world.timeRemaining;
    if (typeof world.elapsedSec === 'number' && Number.isFinite(world.elapsedSec)) {
      const drift = world.elapsedSec - this.platformTime;
      if (Math.abs(drift) > 0.65) {
        this.platformTime = Math.max(0, world.elapsedSec);
      } else if (Math.abs(drift) > 0.04) {
        this.platformTime += drift * 0.16;
      }
    }

    _seenRemoteIds.clear();
    for (const p of world.players) {
      if (p.userId === this.mpLocalUserId) {
        if (!p.alive && this.mpLocalAlive) {
          this.handleMultiplayerCaught(p.userId, p.x, p.y, p.z);
        }
        if (p.escaped && !this.mpLocalEscaped) {
          this.mpLocalEscaped = true;
          this.sound.playVictory();
          this.callbacks.onMultiplayerEscaped?.();
        }
      } else {
        _seenRemoteIds.add(p.userId);
        const prevAlive = this.remotePlayers.get(p.userId)?.alive ?? true;
        this.upsertRemotePlayer(p);
        if (!p.alive && prevAlive) {
          this.handleMultiplayerCaught(p.userId, p.x, p.y, p.z);
        }
      }
    }

    for (const [uid, rp] of this.remotePlayers.entries()) {
      if (!_seenRemoteIds.has(uid)) {
        this.disposeRemotePlayer(rp);
        this.remotePlayers.delete(uid);
      }
    }

    this.syncMonstersFromServer(world.monsters);
  }

  private upsertRemotePlayer(p: PlayerNetState): void {
    const nowMs = performance.now();
    let rp = this.remotePlayers.get(p.userId);
    if (!rp) {
      const rig = createPlayerRig(this.textures, p.avatarColor || '#52e0b6', true);
      rig.setShadowDetail(this.activeQuality);
      const nameplate = createNameplateSprite(p.username, p.avatarColor || '#52e0b6');
      rig.root.add(nameplate);
      rig.root.position.set(p.x, p.y, p.z);
      rig.root.rotation.set(0, p.yaw, 0);
      this.scene.add(rig.root);
      rp = {
        userId: p.userId,
        username: p.username,
        avatarColor: p.avatarColor,
        rig,
        nameplate,
        pos: new THREE.Vector3(p.x, p.y, p.z),
        targetPos: new THREE.Vector3(p.x, p.y, p.z),
        velX: 0,
        velY: 0,
        velZ: 0,
        lastNetTimeMs: nowMs,
        yaw: p.yaw,
        targetYaw: p.yaw,
        animState: p.animState,
        horizSpeed: p.horizSpeed,
        inWater: p.inWater,
        alive: p.alive,
        escaped: p.escaped,
        pushRecoveryTimer: 0,
        pushCand: { userId: p.userId, x: p.x, y: p.y, z: p.z },
      };
      this.remotePlayers.set(p.userId, rp);
    } else {
      const netDt = (nowMs - rp.lastNetTimeMs) / 1000;
      if (netDt > 0.015 && netDt < 0.35) {
        const inv = 1 / netDt;
        rp.velX = THREE.MathUtils.clamp((p.x - rp.targetPos.x) * inv, -14, 14);
        rp.velY = THREE.MathUtils.clamp((p.y - rp.targetPos.y) * inv, -14, 14);
        rp.velZ = THREE.MathUtils.clamp((p.z - rp.targetPos.z) * inv, -14, 14);
      } else if (netDt >= 0.35) {
        rp.velX = 0;
        rp.velY = 0;
        rp.velZ = 0;
      }
      rp.lastNetTimeMs = nowMs;
      rp.targetPos.set(p.x, p.y, p.z);
    }
    rp.targetYaw = p.yaw;
    rp.animState = p.animState;
    rp.horizSpeed = p.horizSpeed;
    rp.inWater = p.inWater;
    rp.alive = p.alive;
    rp.escaped = p.escaped;
    const isBeingEaten = this.isUserBeingEaten(p.userId);
    rp.rig.root.visible = (p.alive || isBeingEaten) && !p.escaped;
  }

  private disposeRemotePlayer(rp: RemotePlayerVisual): void {
    this.scene.remove(rp.rig.root);
    rp.nameplate.material.map?.dispose();
    rp.nameplate.material.dispose();
    rp.rig.dispose();
  }

  private clearRemotePlayers(): void {
    for (const rp of this.remotePlayers.values()) {
      this.disposeRemotePlayer(rp);
    }
    this.remotePlayers.clear();
  }

  private syncMonstersFromServer(serverMonsters: MonsterNetState[]): void {
    for (let i = 0; i < this.monsters.length; i++) {
      const m = this.monsters[i];
      const sm = serverMonsters.find((item) => item.id === m.id) || serverMonsters[i];
      if (!sm) continue;

      if (sm.eatingUserId) {
        const srvProgress = typeof sm.eatingProgress === 'number' ? THREE.MathUtils.clamp(sm.eatingProgress, 0, 1) : 0;
        if (m.eatingUserId !== sm.eatingUserId) {
          const isLocal = sm.eatingUserId === this.mpLocalUserId;
          const rp = !isLocal ? this.remotePlayers.get(sm.eatingUserId) : null;
          const px = isLocal ? this.playerPos.x : rp?.pos.x ?? sm.x;
          const py = isLocal ? this.playerPos.y : rp?.pos.y ?? this.currentLevel.bounds.waterY;
          const pz = isLocal ? this.playerPos.z : rp?.pos.z ?? sm.z;
          const pyaw = isLocal ? this.playerYaw : rp?.yaw ?? 0;
          this.beginMonsterEatingSequence(m, sm.eatingUserId, px, py, pz, pyaw, srvProgress);
          if (isLocal && this.mpLocalAlive && !this.mpLocalBeingEaten) {
            this.handleMultiplayerEatingStarted(sm.eatingUserId, px, py, pz, m.id);
          }
        } else if (srvProgress > m.eatingProgress) {
          m.eatingProgress = srvProgress;
          m.eatingTimer = srvProgress * EAT_DURATION_SEC;
        }
      } else if (m.eatingUserId && !this.mpLocalBeingEaten) {
        // Server cleared eating state cleanly
        m.eatingUserId = null;
        m.eatingProgress = -1;
        m.eatingTimer = 0;
      }

      if (this.phase === 'jumpscare' && this.jumpscareMonster === m) {
        m.velX = sm.velX;
        m.velZ = sm.velZ;
        m.wpIndex = sm.wpIndex;
        m.targetUserId = sm.targetUserId ?? null;
        continue;
      }
      const prevAlert = m.alert;
      m.alert = sm.alert;
      m.emerged = sm.emerged;
      m.velX = sm.velX;
      m.velZ = sm.velZ;
      m.wpIndex = sm.wpIndex;
      m.targetUserId = sm.targetUserId ?? null;
      m.searchTarget.set(sm.x, sm.y, sm.z);
      m.targetYaw = sm.yaw;
      const desyncDist = m.pos.distanceTo(m.searchTarget);
      if (desyncDist > 12) {
        m.pos.copy(m.searchTarget);
        m.yaw = sm.yaw;
        m.rig.root.position.copy(m.pos);
        m.rig.root.rotation.y = 0;
        resetSerpentTrail(m.rig, m.pos, m.yaw);
      } else if (Math.abs(shortestAngleDiff(m.yaw, sm.yaw)) > 2.2) {
        m.yaw = sm.yaw;
      }
      if (prevAlert !== 'chasing' && sm.alert === 'chasing') {
        this.sound.playSerpentEmerge(0.65);
        this.spawnSplash(m.pos, 24, 1.8);
      }
    }
  }

  public restartLevel(): void {
    this.sound.unlock();
    this.virtualMove.x = 0;
    this.virtualMove.y = 0;
    this.virtualRun = false;
    this.virtualAutoRun = false;
    this.loadLevel(this.currentLevel.id, 'playing');
  }

  public respawnAtCheckpoint(): void {
    this.sound.unlock();
    this.virtualMove.x = 0;
    this.virtualMove.y = 0;
    this.virtualRun = false;
    this.virtualAutoRun = false;
    for (const p of this.platforms) {
      if (p.def.kind === 'disappearing') {
        p.state = 'solid';
        p.stateTimer = 0;
        p.mesh.visible = true;
        p.currentPos.set(p.def.position[0], p.def.position[1], p.def.position[2]);
        p.prevPos.copy(p.currentPos);
        p.mesh.position.copy(p.currentPos);
        p.material.color.setHex(p.baseColorHex);
        p.material.emissive.setHex(0x000000);
        p.material.emissiveIntensity = 0;
      }
    }
    this.deathReason = null;
    this.jumpscareMonster = null;
    for (const m of this.monsters) {
      m.alert = 'calm';
      m.emerged = false;
      m.searchTimer = 0;
      m.stuckTimer = 0;
      m.avoidTimer = 0;
      m.velX = 0;
      m.velZ = 0;
      m.navBestDist = Infinity;
      m.navStallTimer = 0;
      m.navAnchorX = m.pos.x;
      m.navAnchorZ = m.pos.z;
      m.navAnchorTimer = 0;
      m.navTurnAccum = 0;
      m.eatingUserId = null;
      m.eatingTimer = 0;
      m.eatingProgress = -1;
      m.eatingGulpStage = 0;
      m.pos.y = this.currentLevel.bounds.waterY - 0.14;
      m.rig.root.position.copy(m.pos);
      m.rig.root.rotation.y = 0;
      resetSerpentTrail(m.rig, m.pos, m.yaw);
    }
    this.phase = 'playing';
    this.respawnAtActiveCheckpoint(true);
    this.emitHud(true);
  }

  public showMenuBackdrop(levelId = 1): void {
    this.loadLevel(levelId, 'menu');
  }

  private clearLevel(): void {
    for (const cp of this.checkpoints) {
      cp.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          if (!obj.geometry.userData?.sharedPool) {
            obj.geometry.dispose();
          }
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => {
              if (!m.userData?.sharedPool) m.dispose();
            });
          } else if (!obj.material.userData?.sharedPool) {
            obj.material.dispose();
          }
        }
      });
    }
    if (this.exitGroup) {
      this.exitGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          if (!obj.geometry.userData?.sharedPool) {
            obj.geometry.dispose();
          }
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => {
              if (!m.userData?.sharedPool) m.dispose();
            });
          } else if (!obj.material.userData?.sharedPool) {
            obj.material.dispose();
          }
        }
      });
    }

    this.platforms = [];
    this.dynamicPlatforms = [];
    this.walls = [];
    this.spatialGrid = null;
    this.checkpoints = [];
    this.stoodPlatform = null;
    this.monsters.forEach((m) => m.rig.dispose());
    this.monsters = [];
    this.clearRemotePlayers();
    this.keyLight = null;
    this.pointLightPool = [];
    this.levelLights = [];
    this.waterMesh = null;
    this.waterMat = null;
    this.exitGroup = null;
    this.mistMesh = null;
    this.coneMesh = null;

    while (this.levelGroup.children.length > 0) {
      this.levelGroup.remove(this.levelGroup.children[0]);
    }
    this.levelDisposables.forEach((d) => d.dispose());
    this.levelDisposables = [];
  }

  public loadLevel(levelId: number, nextPhase: GamePhase, skipPrewarm = false): void {
    this.clearLevel();

    const def = LEVELS.find((l) => l.id === levelId) || LEVELS[0];
    this.currentLevel = def;
    this.spatialGrid = new LevelSpatialGrid(def, 12);
    this.phase = nextPhase;
    this.deathReason = null;
    this.jumpscareMonster = null;
    this.jumpscareTimer = 0;

    // Reset timers & spawn
    this.platformTime = 0;
    this.levelTimeRemaining = def.timeLimit;
    this.levelTimeElapsed = 0;
    this.activeSpawn.set(def.spawn[0], def.spawn[1], def.spawn[2]);
    this.activeCheckpointIndex = 0;
    this.checkpointNotice = null;
    this.checkpointNoticeTimer = 0;
    this.pushCooldownTimer = 0;
    this.pushRecoveryTimer = 0;
    this.pushStaggerTimer = 0;
    this.canPushTargetCache = false;
    this.playerRig.pushAnimTimer = 0;
    this.playerRig.pushedAnimTimer = 0;

    this.respawnAtActiveCheckpoint(false);

    // Scene atmosphere & fog
    this.baseFogColor.set(def.fogColor);
    this.scene.background = this.baseFogColor.clone();
    this.scene.fog = new THREE.FogExp2(def.fogColor, def.fogDensity);

    // 3-point + hemisphere horror poolroom lighting rig
    const hemi = new THREE.HemisphereLight(def.ambientTint, '#0e171a', 0.76);
    this.levelGroup.add(hemi);

    const rimLight = new THREE.DirectionalLight('#6b95a3', 0.44);
    rimLight.position.set(-22, 22, def.bounds.minZ * 0.45 - 35);
    this.levelGroup.add(rimLight);

    const keyLight = new THREE.DirectionalLight('#d7edf2', 1.32);
    keyLight.position.set(def.spawn[0] + 16, 28, def.spawn[2] + 20);
    keyLight.target.position.set(def.spawn[0], 0, def.spawn[2]);
    const wantShadow = !this.isSoftwareGl && this.activeQuality !== 'smooth';
    keyLight.castShadow = wantShadow;
    const sMap = this.activeQuality === 'ultra' ? (this.isTouchDevice ? 1024 : 2048) : 1024;
    keyLight.shadow.mapSize.set(sMap, sMap);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 125;
    const d = this.activeQuality === 'ultra' ? 52 : 38;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.00045;
    keyLight.shadow.normalBias = 0.02;
    this.levelGroup.add(keyLight);
    this.levelGroup.add(keyLight.target);
    this.keyLight = keyLight;

    // Fixed-count PointLight pool so live quality changes never recompile scene shaders
    const poolCount = this.isSoftwareGl ? 2 : 6;
    for (let i = 0; i < poolCount; i++) {
      const pLight = new THREE.PointLight('#d5ecef', i === 0 ? 1.65 : 0, 58, 1.3);
      this.levelGroup.add(pLight);
      this.pointLightPool.push(pLight);
    }

    // Instanced ceiling fluorescent fixture panels + volumetric light-shaft cones
    if (def.lights.length > 0) {
      const panelGeo = new THREE.BoxGeometry(3.8, 0.14, 1.35);
      const panelMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: '#d5ecef',
        emissiveIntensity: 1.9,
        roughness: 0.18,
      });
      const panelInst = new THREE.InstancedMesh(panelGeo, panelMat, def.lights.length);
      const dummy = new THREE.Object3D();
      def.lights.forEach((l, idx) => {
        dummy.position.set(l.position[0], def.bounds.ceilingY - 0.12, l.position[2]);
        dummy.updateMatrix();
        panelInst.setMatrixAt(idx, dummy.matrix);
        panelInst.setColorAt(idx, new THREE.Color(l.color || '#ffffff'));
        this.levelLights.push({
          x: l.position[0],
          y: l.position[1],
          z: l.position[2],
          color: new THREE.Color(l.color || '#d5ecef'),
          baseIntensity: (l.intensity ?? 1.5) * 1.12,
          flickering: Boolean(l.flickering),
          seed: idx * 7.13 + 1.5,
        });
      });
      panelInst.instanceMatrix.needsUpdate = true;
      if (panelInst.instanceColor) panelInst.instanceColor.needsUpdate = true;
      panelInst.computeBoundingSphere();
      this.levelGroup.add(panelInst);
      this.levelDisposables.push(panelGeo, panelMat);

      if (!this.isSoftwareGl) {
        const coneH = Math.max(5.5, def.bounds.ceilingY - def.bounds.waterY - 1.2);
        const coneGeo = new THREE.ConeGeometry(4.4, coneH, 16, 1, true);
        const coneMat = new THREE.MeshBasicMaterial({
          color: 0xbde2ea,
          transparent: true,
          opacity: 0.038,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        const coneInst = new THREE.InstancedMesh(coneGeo, coneMat, def.lights.length);
        def.lights.forEach((l, idx) => {
          dummy.position.set(l.position[0], def.bounds.ceilingY - 0.25 - coneH * 0.5, l.position[2]);
          dummy.updateMatrix();
          coneInst.setMatrixAt(idx, dummy.matrix);
        });
        coneInst.instanceMatrix.needsUpdate = true;
        coneInst.computeBoundingSphere();
        coneInst.visible = this.activeQuality !== 'smooth';
        this.levelGroup.add(coneInst);
        this.coneMesh = coneInst;
        this.levelDisposables.push(coneGeo, coneMat);
      }
    }

    // Build pool basin architecture (tiled outer walls, caustics, ceiling ribs, ladders, perimeter coping)
    this.buildArchitecture(def);

    // Build realistic multi-octave Fresnel water surface
    this.buildWater(def);

    // Build platforms & inner walls with chunked UV-baked static batching
    this.buildPlatforms(def);
    this.buildInnerWalls(def);

    // Build checkpoints + register virtual light sources for pooled PointLights
    def.checkpoints.forEach((cp, cpIdx) => {
      const vis = createCheckpointVisual(cp.position);
      this.levelGroup.add(vis.group);
      this.checkpoints.push(vis);
      this.levelLights.push({
        x: cp.position[0],
        y: cp.position[1] + 1.25,
        z: cp.position[2],
        color: vis.lightColor,
        baseIntensity: 2.1,
        flickering: false,
        seed: 0,
        checkpointIdx: cpIdx,
      });
    });

    // Build Exit Gate + register portal glow in pooled lights
    this.exitGroup = createExitGateMesh(def.exit.position, def.exit.size);
    this.levelGroup.add(this.exitGroup);
    const exitH = Math.max(3.4, def.exit.size[1]);
    this.levelLights.push({
      x: def.exit.position[0],
      y: def.exit.position[1] + exitH * 0.62,
      z: def.exit.position[2] + 1.35,
      color: new THREE.Color(0x52f2bf),
      baseIntensity: 4.5,
      flickering: false,
      seed: 0,
    });

    // Spawn Giant Aquatic Serpents
    def.monsters.forEach((mc, idx) => {
      const rig = createMonsterRig(this.textures, mc.scale || 1);
      rig.setShadowDetail(this.activeQuality);
      const startWp = mc.waypoints[0] || [0, -25];
      const nextWp = mc.waypoints[1] || startWp;
      const scale = mc.scale || 1;
      const pos = new THREE.Vector3(startWp[0], def.bounds.waterY - 0.14, startWp[1]);
      const monsterRadius = 0.9 * scale;
      this.resolveCircleSolids(
        pos,
        monsterRadius,
        def.bounds.waterY - 1.5,
        def.bounds.waterY + 4.2 * scale,
        monsterRadius + 0.15,
        true
      );
      const initYaw = Math.atan2(nextWp[0] - pos.x, nextWp[1] - pos.z) || 0;
      rig.root.position.copy(pos);
      rig.root.rotation.y = 0;
      resetSerpentTrail(rig, pos, initYaw);
      this.levelGroup.add(rig.root);

      this.monsters.push({
        id: mc.id,
        rig,
        pos,
        yaw: initYaw,
        targetYaw: initYaw,
        targetUserId: null,
        waypoints: mc.waypoints,
        wpIndex: 1 % Math.max(1, mc.waypoints.length),
        patrolSpeed: mc.patrolSpeed,
        chaseSpeed: mc.chaseSpeed,
        detectionRadius: mc.detectionRadius,
        waterDetectionRadius: mc.waterDetectionRadius,
        scale,
        alert: 'calm',
        searchTarget: pos.clone(),
        searchTimer: 0,
        velX: 0,
        velZ: 0,
        avoidDir: idx % 2 === 0 ? 1 : -1,
        avoidTimer: 0,
        stuckTimer: 0,
        navBestDist: Infinity,
        navStallTimer: 0,
        navAnchorX: pos.x,
        navAnchorZ: pos.z,
        navAnchorTimer: 0,
        navTurnAccum: 0,
        emerged: false,
        wakeSplashTimer: 0,
        eatingUserId: null,
        eatingTimer: 0,
        eatingProgress: -1,
        eatingPreyStartPos: pos.clone(),
        eatingPreyStartYaw: initYaw,
        eatingGulpStage: 0,
      });
    });

    this.playerRig.setVisible(nextPhase !== 'menu');
    this.applyQualityToRenderer();
    if (!skipPrewarm) {
      this.prewarmSceneShaders();
      this.lastTimeMs = performance.now();
    }
    this.emitHud(true);
  }

  private prewarmSceneShaders(): void {
    const savedVisibility: Array<{ obj: THREE.Object3D; visible: boolean }> = [];
    const savedFrustum: Array<{ obj: THREE.Object3D; frustumCulled: boolean }> = [];

    const forceShow = (obj: THREE.Object3D) => {
      if (!obj.visible) {
        savedVisibility.push({ obj, visible: false });
        obj.visible = true;
      }
    };

    forceShow(this.playerRig.root);
    forceShow(this.playerRig.hips);
    for (const m of this.monsters) {
      forceShow(m.rig.root);
      for (const td of m.rig.jawTendons) {
        forceShow(td);
      }
    }
    for (const rp of this.remotePlayers.values()) {
      forceShow(rp.rig.root);
    }

    const prevSplashCount = this.splashMesh.count;
    let warmedSplash = false;
    if (prevSplashCount === 0) {
      _vSplashScale.setScalar(0.0001);
      _mSplash.compose(this.camera.position, _qIdentity, _vSplashScale);
      this.splashMesh.setMatrixAt(0, _mSplash);
      this.splashMesh.instanceMatrix.needsUpdate = true;
      this.splashMesh.count = 1;
      warmedSplash = true;
    }

    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh || (obj as THREE.Sprite).isSprite) {
        if (obj.frustumCulled) {
          savedFrustum.push({ obj, frustumCulled: true });
          obj.frustumCulled = false;
        }
      }
    });

    const prevScissorTest = this.renderer.getScissorTest();
    const prevAutoClear = this.renderer.autoClear;
    const prevScissor = new THREE.Vector4();
    const prevViewport = new THREE.Vector4();
    this.renderer.getScissor(prevScissor);
    this.renderer.getViewport(prevViewport);

    try {
      this.scene.updateMatrixWorld(true);
      this.camera.updateMatrixWorld(true);
      this.renderer.compile(this.scene, this.camera);
      this.renderer.autoClear = true;
      this.renderer.setScissorTest(true);
      this.renderer.setScissor(0, 0, 1, 1);
      this.renderer.setViewport(0, 0, 1, 1);
      this.renderer.render(this.scene, this.camera);
    } catch {
      // ignore if WebGL context is unavailable or lost
    } finally {
      this.renderer.setScissorTest(prevScissorTest);
      this.renderer.setViewport(prevViewport);
      this.renderer.setScissor(prevScissor);
      this.renderer.autoClear = prevAutoClear;

      for (let i = 0; i < savedFrustum.length; i++) {
        savedFrustum[i].obj.frustumCulled = savedFrustum[i].frustumCulled;
      }
      for (let i = 0; i < savedVisibility.length; i++) {
        savedVisibility[i].obj.visible = savedVisibility[i].visible;
      }
      if (warmedSplash) {
        this.splashMesh.count = prevSplashCount;
      }
    }
  }

  private injectUnderwaterCaustics(mat: THREE.MeshStandardMaterial, waterY: number, isFloor: boolean): void {
    mat.customProgramCacheKey = () => (isFloor ? 'caustics_floor_v2' : 'caustics_wall_v2');
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uCausticTime;
      shader.uniforms.uCausticEnabled = this.uCausticEnabled;
      shader.uniforms.uCausticRangeSq = this.uCausticRangeSq;
      shader.uniforms.uWaterY = { value: waterY };

      shader.vertexShader =
        'varying vec3 vCausticWorldPos;\n' +
        shader.vertexShader.replace(
          '#include <worldpos_vertex>',
          `
          #include <worldpos_vertex>
          vCausticWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          `
        );

      shader.fragmentShader =
        `
        uniform float uTime;
        uniform float uWaterY;
        uniform float uCausticEnabled;
        uniform float uCausticRangeSq;
        varying vec3 vCausticWorldPos;
        float causticPattern(vec2 p, float t) {
          float a = sin(p.x * 1.15 + t * 1.45 + cos(p.y * 0.9 - t * 1.1));
          float b = cos(p.y * 1.25 - t * 1.3 + sin(p.x * 0.85 + t * 0.95));
          float c = sin((p.x + p.y) * 0.95 + t * 1.75);
          float v = abs(a * 0.45 + b * 0.4 + c * 0.25);
          return pow(max(0.0, 1.0 - v * 1.65), 3.0);
        }
        ` +
        shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `
          #include <emissivemap_fragment>
          if (uCausticEnabled > 0.5) {
            vec3 cDelta = vCausticWorldPos - cameraPosition;
            float cDistSq = dot(cDelta, cDelta);
            if (cDistSq < uCausticRangeSq) {
              float subDepth = uWaterY - vCausticWorldPos.y;
              float mask = ${isFloor ? '1.0' : 'smoothstep(-0.25, 0.45, subDepth)'};
              if (mask > 0.01) {
                float c1 = causticPattern(vCausticWorldPos.xz * 0.42 + vCausticWorldPos.xy * 0.12, uTime);
                float c2 = causticPattern(vCausticWorldPos.zx * 0.34 - uTime * 0.3, -uTime * 0.85);
                float cFade = 1.0 - smoothstep(uCausticRangeSq * 0.45, uCausticRangeSq, cDistSq);
                float caustic = (c1 + c2) * 0.5 * mask * cFade;
                totalEmissiveRadiance += vec3(0.14, 0.28, 0.31) * caustic * 0.85;
              }
            }
          }
          `
        );
    };
  }

  private buildArchitecture(def: LevelDef): void {
    const { minX, maxX, minZ, maxZ, floorY, waterY, ceilingY } = def.bounds;
    const width = maxX - minX;
    const depth = maxZ - minZ;
    const height = ceilingY - floorY;
    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;

    // Pool Floor (glazed ceramic tile with roughness map + animated underwater caustics)
    const floorTex = this.textures.tileAlbedo.clone();
    floorTex.repeat.set(width / 3.2, depth / 3.2);
    floorTex.needsUpdate = true;
    const floorBump = this.textures.tileBump.clone();
    floorBump.repeat.set(width / 3.2, depth / 3.2);
    floorBump.needsUpdate = true;
    const floorRough = this.textures.tileRoughness.clone();
    floorRough.repeat.set(width / 3.2, depth / 3.2);
    floorRough.needsUpdate = true;

    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      bumpMap: floorBump,
      bumpScale: 0.025,
      roughnessMap: floorRough,
      color: 0x6f8488,
      roughness: 0.32,
      metalness: 0.06,
    });
    this.injectUnderwaterCaustics(floorMat, waterY, true);
    const floorGeo = new THREE.PlaneGeometry(width, depth);
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(cx, floorY, cz);
    floorMesh.receiveShadow = true;
    this.levelGroup.add(floorMesh);
    this.levelDisposables.push(floorTex, floorBump, floorRough, floorMat, floorGeo);

    // Ceiling
    const ceilGeo = new THREE.PlaneGeometry(width, depth);
    const ceilMat = new THREE.MeshStandardMaterial({
      map: this.textures.ceilingAlbedo,
      color: 0x738286,
      roughness: 0.85,
      metalness: 0.06,
    });
    const ceilMesh = new THREE.Mesh(ceilGeo, ceilMat);
    ceilMesh.rotation.x = Math.PI / 2;
    ceilMesh.position.set(cx, ceilingY, cz);
    this.levelGroup.add(ceilMesh);
    this.levelDisposables.push(ceilGeo, ceilMat);

    // Outer Perimeter Tiled Walls with masonry bump & submerged caustics
    const makeWallMat = (repU: number, repV: number) => {
      const mTex = this.textures.wallAlbedo.clone();
      mTex.repeat.set(repU, repV);
      mTex.needsUpdate = true;
      const bTex = this.textures.wallBump.clone();
      bTex.repeat.set(repU, repV);
      bTex.needsUpdate = true;
      const m = new THREE.MeshStandardMaterial({
        map: mTex,
        bumpMap: bTex,
        bumpScale: 0.025,
        color: 0xaab8bc,
        roughness: 0.38,
        metalness: 0.05,
      });
      this.injectUnderwaterCaustics(m, waterY, false);
      this.levelDisposables.push(mTex, bTex, m);
      return m;
    };

    const wallMatLR = makeWallMat(depth / 4.2, height / 4.2);
    const wallMatFB = makeWallMat(width / 4.2, height / 4.2);

    const wallLRGeo = new THREE.PlaneGeometry(depth, height);
    const leftWall = new THREE.Mesh(wallLRGeo, wallMatLR);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(minX, floorY + height * 0.5, cz);
    leftWall.receiveShadow = true;
    this.levelGroup.add(leftWall);

    const rightWall = new THREE.Mesh(wallLRGeo, wallMatLR);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(maxX, floorY + height * 0.5, cz);
    rightWall.receiveShadow = true;
    this.levelGroup.add(rightWall);

    const wallFBGeo = new THREE.PlaneGeometry(width, height);
    const backWall = new THREE.Mesh(wallFBGeo, wallMatFB);
    backWall.position.set(cx, floorY + height * 0.5, minZ);
    backWall.receiveShadow = true;
    this.levelGroup.add(backWall);

    const frontWall = new THREE.Mesh(wallFBGeo, wallMatFB);
    frontWall.rotation.y = Math.PI;
    frontWall.position.set(cx, floorY + height * 0.5, maxZ);
    frontWall.receiveShadow = true;
    this.levelGroup.add(frontWall);
    this.levelDisposables.push(wallLRGeo, wallFBGeo);

    // Instanced Reinforced Concrete Ceiling Structural Beams + Side Wall Coping Ledges + Pool Ladders
    const ribSpacing = 16;
    const ribZs: number[] = [];
    for (let z = maxZ - 8; z >= minZ + 8; z -= ribSpacing) ribZs.push(z);

    if (ribZs.length > 0) {
      const beamGeo = new THREE.BoxGeometry(width, 0.72, 0.85);
      const beamMat = new THREE.MeshStandardMaterial({
        map: this.textures.concreteAlbedo,
        bumpMap: this.textures.concreteBump,
        bumpScale: 0.025,
        color: 0x6c777a,
        roughness: 0.78,
        metalness: 0.08,
      });
      const beamInst = new THREE.InstancedMesh(beamGeo, beamMat, ribZs.length);
      const dummy = new THREE.Object3D();
      ribZs.forEach((z, idx) => {
        dummy.position.set(cx, ceilingY - 0.36, z);
        dummy.updateMatrix();
        beamInst.setMatrixAt(idx, dummy.matrix);
      });
      beamInst.instanceMatrix.needsUpdate = true;
      beamInst.computeBoundingSphere();
      this.levelGroup.add(beamInst);

      // Wall vertical concrete pilasters under each ceiling beam along left & right walls
      const pilasterGeo = new THREE.BoxGeometry(0.55, height, 0.95);
      const pilInst = new THREE.InstancedMesh(pilasterGeo, beamMat, ribZs.length * 2);
      ribZs.forEach((z, idx) => {
        dummy.position.set(minX + 0.25, floorY + height * 0.5, z);
        dummy.updateMatrix();
        pilInst.setMatrixAt(idx * 2, dummy.matrix);
        dummy.position.set(maxX - 0.25, floorY + height * 0.5, z);
        dummy.updateMatrix();
        pilInst.setMatrixAt(idx * 2 + 1, dummy.matrix);
      });
      pilInst.instanceMatrix.needsUpdate = true;
      pilInst.computeBoundingSphere();
      this.levelGroup.add(pilInst);
      this.levelDisposables.push(beamGeo, pilasterGeo, beamMat);

      // Perimeter stainless wall coping gutter rails just above waterline
      const gutterGeo = new THREE.BoxGeometry(0.28, 0.22, depth);
      const steelMat = new THREE.MeshStandardMaterial({
        map: this.textures.metalAlbedo,
        bumpMap: this.textures.metalBump,
        bumpScale: 0.015,
        color: 0x9aa8ad,
        roughness: 0.28,
        metalness: 0.84,
      });
      for (const sideX of [minX + 0.14, maxX - 0.14]) {
        const g = new THREE.Mesh(gutterGeo, steelMat);
        g.position.set(sideX, waterY + 0.22, cz);
        this.levelGroup.add(g);
      }

      // Instanced brushed stainless pool ladders along side walls
      const ladderZs = ribZs.filter((_, i) => i % 2 === 0);
      if (ladderZs.length > 0) {
        const railGeo = new THREE.CylinderGeometry(0.032, 0.032, 3.2, 8);
        const railInst = new THREE.InstancedMesh(railGeo, steelMat, ladderZs.length * 4);
        let rIdx = 0;
        for (const z of ladderZs) {
          for (const side of [-1, 1] as const) {
            const wx = side < 0 ? minX + 0.28 : maxX - 0.28;
            for (const dz of [-0.32, 0.32]) {
              dummy.position.set(wx, waterY + 0.25, z + dz);
              dummy.updateMatrix();
              railInst.setMatrixAt(rIdx++, dummy.matrix);
            }
          }
        }
        railInst.instanceMatrix.needsUpdate = true;
        railInst.computeBoundingSphere();
        this.levelGroup.add(railInst);
        this.levelDisposables.push(railGeo);
      }
      this.levelDisposables.push(gutterGeo, steelMat);

      // Distant cavernous ceiling bulkhead silhouettes & structural side knee-braces (single instanced pass)
      if (ribZs.length > 2) {
        const dropH = Math.max(1.4, (ceilingY - waterY) * 0.22);
        const dropGeo = new THREE.BoxGeometry(width * 0.72, dropH, 0.55);
        const dropMat = new THREE.MeshStandardMaterial({
          color: 0x263136,
          roughness: 0.9,
          metalness: 0.1,
        });
        const bulkheadZs = ribZs.filter((_, i) => i % 2 === 1);
        if (bulkheadZs.length > 0) {
          const dropInst = new THREE.InstancedMesh(dropGeo, dropMat, bulkheadZs.length);
          bulkheadZs.forEach((z, idx) => {
            dummy.position.set(cx, ceilingY - dropH * 0.5 - 0.2, z);
            dummy.updateMatrix();
            dropInst.setMatrixAt(idx, dummy.matrix);
          });
          dropInst.instanceMatrix.needsUpdate = true;
          dropInst.computeBoundingSphere();
          this.levelGroup.add(dropInst);
        }
        this.levelDisposables.push(dropGeo, dropMat);
      }

      // Subtle low-lying drifting poolroom surface mist sheets (toggled via quality preset)
      if (!this.isSoftwareGl) {
        const mistCanvas = document.createElement('canvas');
        mistCanvas.width = 128;
        mistCanvas.height = 128;
        const mctx = mistCanvas.getContext('2d');
        if (mctx) {
          const grad = mctx.createRadialGradient(64, 64, 6, 64, 64, 62);
          grad.addColorStop(0, 'rgba(205, 226, 232, 0.28)');
          grad.addColorStop(0.55, 'rgba(175, 204, 212, 0.11)');
          grad.addColorStop(1, 'rgba(150, 185, 194, 0)');
          mctx.fillStyle = grad;
          mctx.fillRect(0, 0, 128, 128);
        }
        const mistTex = new THREE.CanvasTexture(mistCanvas);
        const mistGeo = new THREE.PlaneGeometry(24, 24);
        const mistMat = new THREE.MeshBasicMaterial({
          map: mistTex,
          color: new THREE.Color(def.ambientTint),
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const mistCols = width > 70 ? [-width * 0.26, 0, width * 0.26] : [0];
        const mistRows = Math.min(10, Math.max(4, Math.floor(depth / 32)));
        const mistCount = mistCols.length * mistRows;
        const mistInst = new THREE.InstancedMesh(mistGeo, mistMat, mistCount);
        let mIdx = 0;
        for (let r = 0; r < mistRows; r++) {
          const mz = maxZ - 18 - (r / Math.max(1, mistRows - 1)) * (depth - 36);
          for (let c = 0; c < mistCols.length; c++) {
            dummy.position.set(cx + mistCols[c], waterY + 0.48 + (mIdx % 3) * 0.14, mz);
            dummy.rotation.set(-Math.PI / 2, 0, (mIdx * 1.17) % Math.PI);
            dummy.updateMatrix();
            mistInst.setMatrixAt(mIdx++, dummy.matrix);
          }
        }
        mistInst.instanceMatrix.needsUpdate = true;
        mistInst.computeBoundingSphere();
        mistInst.renderOrder = 3;
        mistInst.visible = this.activeQuality !== 'smooth';
        this.levelGroup.add(mistInst);
        this.mistMesh = mistInst;
        this.levelDisposables.push(mistTex, mistGeo, mistMat);
      }
    }
  }

  private buildWater(def: LevelDef): void {
    const { minX, maxX, minZ, maxZ, waterY } = def.bounds;
    const width = maxX - minX;
    const depth = maxZ - minZ;
    const cx = (minX + maxX) * 0.5;
    const cz = (minZ + maxZ) * 0.5;

    const segX = this.isSoftwareGl ? 14 : this.isTouchDevice ? 22 : 34;
    const segZ = this.isSoftwareGl ? 28 : this.isTouchDevice ? 44 : 68;
    const geo = new THREE.PlaneGeometry(width, depth, segX, segZ);

    this.textures.waterNormal.repeat.set(Math.max(5, width / 8.5), Math.max(10, depth / 8.5));
    this.textures.waterNormal.needsUpdate = true;

    const useLightWaterMat = this.isSoftwareGl || this.isTouchDevice || this.activeQuality !== 'ultra';
    const mat: THREE.MeshStandardMaterial = useLightWaterMat
      ? new THREE.MeshStandardMaterial({
          color: 0x355f68,
          roughness: 0.12,
          metalness: 0.24,
          normalMap: this.textures.waterNormal,
          normalScale: new THREE.Vector2(0.85, 0.85),
          envMapIntensity: this.activeQuality === 'smooth' ? 0.85 : 1.45,
          transparent: true,
          opacity: 0.84,
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0x2f5a63,
          roughness: 0.06,
          metalness: 0.14,
          clearcoat: 1.0,
          clearcoatRoughness: 0.05,
          ior: 1.333,
          reflectivity: 0.92,
          normalMap: this.textures.waterNormal,
          normalScale: new THREE.Vector2(0.9, 0.9),
          envMapIntensity: 1.68,
          transparent: true,
          opacity: 0.84,
        });

    // Multi-octave swells + real-time serpent V-wake water displacement & churning whitewater foam
    mat.customProgramCacheKey = () => 'water_surface_aaa_v2';
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uSerpentHead = { value: new THREE.Vector2(0, -999) };
      shader.uniforms.uSerpentDir = { value: new THREE.Vector2(0, 1) };
      shader.uniforms.uSerpentWake = { value: 0 };
      mat.userData.shader = shader;
      shader.vertexShader =
        'uniform float uTime;\nuniform vec2 uSerpentHead;\nuniform vec2 uSerpentDir;\nuniform float uSerpentWake;\nvarying float vWaveHeight;\nvarying float vSerpentFoam;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `
          #include <begin_vertex>
          float w1 = sin(position.x * 0.48 + uTime * 1.65) * cos(position.y * 0.42 - uTime * 1.25) * 0.014;
          float w2 = sin((position.x * 0.82 - position.y * 0.95) + uTime * 2.15) * 0.008;
          float w3 = cos((position.x * 1.4 + position.y * 1.1) - uTime * 2.8) * 0.004;
          float wh = w1 + w2 + w3 + 0.026;

          vec2 worldXZ = (modelMatrix * vec4(transformed, 1.0)).xz;
          vec2 rel = worldXZ - uSerpentHead;
          float along = dot(rel, uSerpentDir);
          float across = dot(rel, vec2(-uSerpentDir.y, uSerpentDir.x));
          float wakeDisp = 0.0;
          float foamMask = 0.0;
          if (uSerpentWake > 0.01 && along < 3.5 && along > -24.0) {
            float trailT = clamp(-along / 22.0, 0.0, 1.0);
            float vWidth = 1.0 + trailT * 4.4;
            float vEdge = abs(abs(across) - vWidth * 0.72);
            float bowCrest = exp(-(vEdge * vEdge) / 0.85) * exp(-trailT * 1.65);
            float coreTrough = exp(-(across * across) / (0.8 + trailT * 1.2)) * exp(-trailT * 1.4);
            float thrash = sin(along * 1.5 - uTime * 26.0) * 0.5 + 0.5;
            wakeDisp = (bowCrest * 0.24 - coreTrough * 0.14 + bowCrest * thrash * 0.12) * uSerpentWake;
            foamMask = clamp((bowCrest * 0.85 + coreTrough * (0.55 + thrash * 0.45)) * uSerpentWake, 0.0, 1.0);
          }

          transformed.z += wh + wakeDisp;
          vWaveHeight = wh + wakeDisp;
          vSerpentFoam = foamMask;
          `
        );

      shader.fragmentShader =
        'varying float vWaveHeight;\nvarying float vSerpentFoam;\n' +
        shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `
          #include <emissivemap_fragment>
          float fresnel = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 3.0);
          float crest = smoothstep(0.032, 0.09, vWaveHeight);
          totalEmissiveRadiance += vec3(0.10, 0.20, 0.23) * fresnel * 0.65 + vec3(0.16, 0.24, 0.26) * vSerpentFoam * 0.45;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.76, 0.89, 0.92), clamp(crest * 0.28 + fresnel * 0.14 + vSerpentFoam * 0.75, 0.0, 0.92));
          `
        );
    };

    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(cx, waterY, cz);
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    this.levelGroup.add(mesh);

    this.waterMesh = mesh;
    this.waterMat = mat;
    this.levelDisposables.push(geo, mat);
  }

  private makeTiledBoxGeo(w: number, h: number, d: number, tileU: number, tileV: number): THREE.BoxGeometry {
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv;
    const arr = uv.array as Float32Array;
    const ux = Math.max(0.5, d / tileU);
    const vx = Math.max(0.5, h / tileV);
    for (let i = 0; i < 8; i++) {
      arr[i * 2] *= ux;
      arr[i * 2 + 1] *= vx;
    }
    const uy = Math.max(0.5, w / tileU);
    const vy = Math.max(0.5, d / tileV);
    for (let i = 8; i < 16; i++) {
      arr[i * 2] *= uy;
      arr[i * 2 + 1] *= vy;
    }
    const uz = Math.max(0.5, w / tileU);
    const vz = Math.max(0.5, h / tileV);
    for (let i = 16; i < 24; i++) {
      arr[i * 2] *= uz;
      arr[i * 2 + 1] *= vz;
    }
    uv.needsUpdate = true;
    return geo;
  }

  private transformGeo(
    geo: THREE.BufferGeometry,
    px: number,
    py: number,
    pz: number,
    rx = 0,
    ry = 0,
    rz = 0
  ): THREE.BufferGeometry {
    _eBake.set(rx, ry, rz);
    _qBake.setFromEuler(_eBake);
    _pBake.set(px, py, pz);
    _mBake.compose(_pBake, _qBake, _sBake);
    geo.applyMatrix4(_mBake);
    return geo;
  }

  private flushStaticChunks(
    buckets: Map<number, Map<THREE.Material, { cast: THREE.BufferGeometry[]; noCast: THREE.BufferGeometry[] }>>
  ): void {
    for (const matMap of buckets.values()) {
      for (const [mat, lists] of matMap.entries()) {
        if (lists.cast.length > 0) {
          const merged = lists.cast.length === 1 ? lists.cast[0] : mergeGeometries(lists.cast, false);
          if (merged) {
            if (lists.cast.length > 1) {
              lists.cast.forEach((g) => g.dispose());
            }
            const mesh = new THREE.Mesh(merged, mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.levelGroup.add(mesh);
            this.levelDisposables.push(merged);
          }
        }
        if (lists.noCast.length > 0) {
          const merged = lists.noCast.length === 1 ? lists.noCast[0] : mergeGeometries(lists.noCast, false);
          if (merged) {
            if (lists.noCast.length > 1) {
              lists.noCast.forEach((g) => g.dispose());
            }
            const mesh = new THREE.Mesh(merged, mat);
            mesh.castShadow = false;
            mesh.receiveShadow = true;
            this.levelGroup.add(mesh);
            this.levelDisposables.push(merged);
          }
        }
      }
    }
  }

  private addChunkPart(
    buckets: Map<number, Map<THREE.Material, { cast: THREE.BufferGeometry[]; noCast: THREE.BufferGeometry[] }>>,
    chunkIdx: number,
    mat: THREE.Material,
    geo: THREE.BufferGeometry,
    castShadow: boolean
  ): void {
    let matMap = buckets.get(chunkIdx);
    if (!matMap) {
      matMap = new Map();
      buckets.set(chunkIdx, matMap);
    }
    let lists = matMap.get(mat);
    if (!lists) {
      lists = { cast: [], noCast: [] };
      matMap.set(mat, lists);
    }
    if (castShadow) lists.cast.push(geo);
    else lists.noCast.push(geo);
  }

  private buildPlatforms(def: LevelDef): void {
    const subFrameMat = new THREE.MeshStandardMaterial({
      map: this.textures.concreteAlbedo,
      bumpMap: this.textures.concreteBump,
      bumpScale: 0.02,
      color: 0x3b474b,
      roughness: 0.82,
      metalness: 0.14,
    });
    const curbSteelMat = new THREE.MeshStandardMaterial({
      map: this.textures.metalAlbedo,
      bumpMap: this.textures.metalBump,
      bumpScale: 0.015,
      color: 0x9aa8ad,
      roughness: 0.24,
      metalness: 0.86,
    });
    const woodWetMat = new THREE.MeshStandardMaterial({
      map: this.textures.woodAlbedo,
      bumpMap: this.textures.woodBump,
      bumpScale: 0.03,
      color: 0x5c4430,
      roughness: 0.34,
      metalness: 0.05,
    });
    const woodTrimMat = new THREE.MeshStandardMaterial({
      map: this.textures.woodAlbedo,
      bumpMap: this.textures.woodBump,
      bumpScale: 0.028,
      color: 0x7c5c3e,
      roughness: 0.68,
      metalness: 0.04,
    });
    const woodIronMat = new THREE.MeshStandardMaterial({
      map: this.textures.metalAlbedo,
      bumpMap: this.textures.metalBump,
      bumpScale: 0.02,
      color: 0x454d50,
      roughness: 0.52,
      metalness: 0.72,
    });
    this.levelDisposables.push(subFrameMat, curbSteelMat, woodWetMat, woodTrimMat, woodIronMat);

    // One shared material per static platform finish (UV tiling baked onto BoxGeometry per surface)
    const accentMatMap = new Map<string, THREE.MeshStandardMaterial>();
    const getAccentMaterial = (texKey: string, isWood: boolean, color: number, roughness: number, metalness: number, baseTex: THREE.Texture, bumpBase: THREE.Texture | null, roughBase: THREE.Texture | null) => {
      let cached = accentMatMap.get(texKey);
      if (!cached) {
        cached = new THREE.MeshStandardMaterial({
          map: baseTex,
          bumpMap: bumpBase,
          bumpScale: isWood ? 0.032 : 0.022,
          roughnessMap: roughBase,
          color,
          roughness,
          metalness,
        });
        accentMatMap.set(texKey, cached);
        this.levelDisposables.push(cached);
      }
      return cached;
    };

    const bollardProto = new THREE.CylinderGeometry(0.085, 0.1, 0.34, 8);
    const minZ = def.bounds.minZ;
    const chunkBuckets = new Map<number, Map<THREE.Material, { cast: THREE.BufferGeometry[]; noCast: THREE.BufferGeometry[] }>>();
    const dummyStaticObj = new THREE.Object3D();

    def.platforms.forEach((p) => {
      const [w, h, d] = p.size;
      const isWood = p.accent === 'wood';
      const isDynamic = p.kind === 'moving' || p.kind === 'disappearing' || Boolean(p.rotationSpeed);

      let color = 0xb9c7ca;
      let baseTex = this.textures.tileAlbedo;
      let bumpBase: THREE.Texture | null = this.textures.tileBump;
      let roughBase: THREE.Texture | null = this.textures.tileRoughness;
      let texKey = 'tile';
      let roughness = 0.34;
      let metalness = 0.08;

      if (isWood) {
        baseTex = this.textures.woodAlbedo;
        bumpBase = this.textures.woodBump;
        roughBase = this.textures.woodRoughness;
        texKey = 'wood';
        color = 0xc9a57e;
        roughness = 0.74;
        metalness = 0.04;
      } else if (p.accent === 'caution' || p.kind === 'moving' || p.kind === 'disappearing') {
        baseTex = this.textures.cautionAlbedo;
        bumpBase = this.textures.metalBump;
        roughBase = null;
        texKey = p.kind === 'disappearing' ? 'caution_fragile' : 'caution';
        color = p.kind === 'disappearing' ? 0xc79f74 : 0xb8c2c4;
        roughness = 0.44;
        metalness = 0.22;
      } else if (p.accent === 'concrete') {
        baseTex = this.textures.concreteAlbedo;
        bumpBase = this.textures.concreteBump;
        roughBase = null;
        texKey = 'concrete';
        color = 0x8f9a9d;
        roughness = 0.78;
      } else if (p.accent === 'metal' || p.kind === 'bridge' || p.kind === 'ladder_step') {
        baseTex = this.textures.metalAlbedo;
        bumpBase = this.textures.metalBump;
        roughBase = null;
        texKey = 'metal';
        color = 0xb2c0c6;
        roughness = 0.24;
        metalness = 0.86;
      } else if (p.accent === 'start') {
        color = 0xaec2c8;
        texKey = 'start';
      } else if (p.accent === 'exit') {
        color = 0x99ccb9;
        texKey = 'exit';
      }

      let mat: THREE.MeshStandardMaterial;
      if (p.kind === 'disappearing') {
        mat = new THREE.MeshStandardMaterial({
          map: baseTex,
          bumpMap: bumpBase,
          bumpScale: 0.022,
          color,
          roughness,
          metalness,
          transparent: false,
          opacity: 1,
        });
        this.levelDisposables.push(mat);
      } else {
        mat = getAccentMaterial(texKey, isWood, color, roughness, metalness, baseTex, bumpBase, roughBase);
      }

      const [px0, py0, pz0] = p.position;
      const chunkIdx = Math.floor((pz0 - minZ) / CHUNK_Z_SPAN);

      if (!isDynamic) {
        // Bake every static deck sub-part cleanly into 36m Z-chunks for massive draw-call reduction
        if (isWood) {
          const topH = Math.min(h * 0.34, 0.24);
          this.addChunkPart(
            chunkBuckets,
            chunkIdx,
            mat,
            this.transformGeo(this.makeTiledBoxGeo(w, topH, d, 2.4, 2.4), px0, py0 + h * 0.5 - topH * 0.5, pz0),
            true
          );

          const subH = Math.max(0.12, h - topH);
          this.addChunkPart(
            chunkBuckets,
            chunkIdx,
            woodWetMat,
            this.transformGeo(this.makeTiledBoxGeo(Math.max(0.5, w * 0.94), subH, Math.max(0.5, d * 0.94), 2.4, 2.4), px0, py0 - h * 0.5 + subH * 0.5, pz0),
            false
          );

          const isCompactWood = Math.min(w, d) < 4.5;
          const joistCount = Math.max(2, Math.round(d / 4.2));
          const jw = w * 0.985;
          const jh = isCompactWood ? 0.11 : 0.14;
          const jd = isCompactWood ? 0.18 : 0.24;
          for (let ji = 0; ji < joistCount; ji++) {
            const zFrac = joistCount === 1 ? 0 : -0.42 + (0.84 * ji) / (joistCount - 1);
            this.addChunkPart(
              chunkBuckets,
              chunkIdx,
              woodTrimMat,
              this.transformGeo(this.makeTiledBoxGeo(jw, jh, jd, 2.4, 2.4), px0, py0 + h * 0.5 - topH - 0.06, pz0 + zFrac * d),
              false
            );
          }

          const pilingH = h + 0.02;
          const pilingSize = isCompactWood ? 0.24 : 0.36;
          const collarSize = isCompactWood ? 0.28 : 0.4;
          const pilingInset = isCompactWood ? 0.14 : 0.2;
          const collarH = isCompactWood ? 0.07 : 0.09;
          for (const sx of [-1, 1] as const) {
            for (const sz of [-1, 1] as const) {
              const cx = px0 + sx * (w * 0.5 - pilingInset);
              const cz = pz0 + sz * (d * 0.5 - pilingInset);
              this.addChunkPart(
                chunkBuckets,
                chunkIdx,
                woodTrimMat,
                this.transformGeo(this.makeTiledBoxGeo(pilingSize, pilingH, pilingSize, 2.0, 2.0), cx, py0 + 0.01, cz),
                false
              );
              this.addChunkPart(
                chunkBuckets,
                chunkIdx,
                woodIronMat,
                this.transformGeo(this.makeTiledBoxGeo(collarSize, collarH, collarSize, 1.5, 1.5), cx, py0 + h * 0.5 - 0.09, cz),
                false
              );
            }
          }
        } else {
          const topH = Math.min(h * 0.48, 0.24);
          this.addChunkPart(
            chunkBuckets,
            chunkIdx,
            mat,
            this.transformGeo(this.makeTiledBoxGeo(w, topH, d, 2.4, 2.4), px0, py0 + h * 0.5 - topH * 0.5, pz0),
            true
          );

          const subH = Math.max(0.08, h - topH);
          this.addChunkPart(
            chunkBuckets,
            chunkIdx,
            subFrameMat,
            this.transformGeo(this.makeTiledBoxGeo(Math.max(0.5, w * 0.91), subH, Math.max(0.5, d * 0.91), 2.8, 2.8), px0, py0 - h * 0.5 + subH * 0.5, pz0),
            false
          );

          if (p.kind === 'bridge') {
            const alongZ = d >= w;
            const rw = alongZ ? 0.14 : w;
            const rd = alongZ ? d : 0.14;
            for (const s of [-1, 1] as const) {
              const rx = alongZ ? px0 + s * (w * 0.5 - 0.07) : px0;
              const rz = alongZ ? pz0 : pz0 + s * (d * 0.5 - 0.07);
              this.addChunkPart(
                chunkBuckets,
                chunkIdx,
                curbSteelMat,
                this.transformGeo(this.makeTiledBoxGeo(rw, 0.12, rd, 2.0, 2.0), rx, py0 + h * 0.5 + 0.04, rz),
                false
              );
            }
          } else if (p.size[0] >= 6.8 && p.size[2] >= 6.8) {
            for (const sx of [-1, 1] as const) {
              for (const sz of [-1, 1] as const) {
                const bGeo = bollardProto.clone();
                this.transformGeo(bGeo, px0 + sx * (w * 0.5 - 0.35), py0 + h * 0.5 + 0.15, pz0 + sz * (d * 0.5 - 0.35));
                this.addChunkPart(chunkBuckets, chunkIdx, curbSteelMat, bGeo, false);
              }
            }
          }
        }

        const boundRadiusXZ = Math.hypot(w * 0.5, d * 0.5);
        this.platforms.push({
          def: p,
          mesh: dummyStaticObj,
          material: mat,
          baseColorHex: color,
          boundRadiusXZ,
          currentPos: new THREE.Vector3(px0, py0, pz0),
          prevPos: new THREE.Vector3(px0, py0, pz0),
          currentQuat: _qIdentity.clone(),
          prevQuat: _qIdentity.clone(),
          invQuat: _qIdentity.clone(),
          prevInvQuat: _qIdentity.clone(),
          isRotated: false,
          state: 'solid',
          stateTimer: 0,
        });
        return;
      }

      // Dynamic platform (moving, rotating, disappearing) — merge repeated trim sub-parts into minimal draw calls
      const group = new THREE.Group();
      group.position.set(px0, py0, pz0);
      const localBuckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
      const pushLocal = (m: THREE.Material, g: THREE.BufferGeometry) => {
        let arr = localBuckets.get(m);
        if (!arr) {
          arr = [];
          localBuckets.set(m, arr);
        }
        arr.push(g);
      };

      if (isWood) {
        const topH = Math.min(h * 0.34, 0.24);
        const topGeo = this.makeTiledBoxGeo(w, topH, d, 2.4, 2.4);
        const topMesh = new THREE.Mesh(topGeo, mat);
        topMesh.position.y = h * 0.5 - topH * 0.5;
        topMesh.castShadow = true;
        topMesh.receiveShadow = true;
        group.add(topMesh);
        this.levelDisposables.push(topGeo);

        const subH = Math.max(0.12, h - topH);
        pushLocal(
          woodWetMat,
          this.transformGeo(this.makeTiledBoxGeo(Math.max(0.5, w * 0.94), subH, Math.max(0.5, d * 0.94), 2.4, 2.4), 0, -h * 0.5 + subH * 0.5, 0)
        );

        const isCompactWood = Math.min(w, d) < 4.5;
        const joistCount = Math.max(2, Math.round(d / 4.2));
        for (let ji = 0; ji < joistCount; ji++) {
          const zFrac = joistCount === 1 ? 0 : -0.42 + (0.84 * ji) / (joistCount - 1);
          pushLocal(
            woodTrimMat,
            this.transformGeo(
              this.makeTiledBoxGeo(w * 0.985, isCompactWood ? 0.11 : 0.14, isCompactWood ? 0.18 : 0.24, 2.4, 2.4),
              0,
              h * 0.5 - topH - 0.06,
              zFrac * d
            )
          );
        }

        const pilingH = h + 0.02;
        const pilingSize = isCompactWood ? 0.24 : 0.36;
        const collarSize = isCompactWood ? 0.28 : 0.4;
        const pilingInset = isCompactWood ? 0.14 : 0.2;
        for (const sx of [-1, 1] as const) {
          for (const sz of [-1, 1] as const) {
            const px = sx * (w * 0.5 - pilingInset);
            const pz = sz * (d * 0.5 - pilingInset);
            pushLocal(woodTrimMat, this.transformGeo(this.makeTiledBoxGeo(pilingSize, pilingH, pilingSize, 2.0, 2.0), px, 0.01, pz));
            pushLocal(
              woodIronMat,
              this.transformGeo(this.makeTiledBoxGeo(collarSize, isCompactWood ? 0.07 : 0.09, collarSize, 1.5, 1.5), px, h * 0.5 - 0.09, pz)
            );
          }
        }
      } else {
        const topH = Math.min(h * 0.48, 0.24);
        const topGeo = this.makeTiledBoxGeo(w, topH, d, 2.4, 2.4);
        const topMesh = new THREE.Mesh(topGeo, mat);
        topMesh.position.y = h * 0.5 - topH * 0.5;
        topMesh.castShadow = true;
        topMesh.receiveShadow = true;
        group.add(topMesh);
        this.levelDisposables.push(topGeo);

        const subH = Math.max(0.08, h - topH);
        pushLocal(
          subFrameMat,
          this.transformGeo(this.makeTiledBoxGeo(Math.max(0.5, w * 0.91), subH, Math.max(0.5, d * 0.91), 2.8, 2.8), 0, -h * 0.5 + subH * 0.5, 0)
        );

        if (p.kind === 'bridge') {
          const alongZ = d >= w;
          for (const s of [-1, 1] as const) {
            pushLocal(
              curbSteelMat,
              this.transformGeo(
                this.makeTiledBoxGeo(alongZ ? 0.14 : w, 0.12, alongZ ? d : 0.14, 2.0, 2.0),
                alongZ ? s * (w * 0.5 - 0.07) : 0,
                h * 0.5 + 0.04,
                alongZ ? 0 : s * (d * 0.5 - 0.07)
              )
            );
          }
        } else if (p.size[0] >= 6.8 && p.size[2] >= 6.8) {
          for (const sx of [-1, 1] as const) {
            for (const sz of [-1, 1] as const) {
              pushLocal(
                curbSteelMat,
                this.transformGeo(bollardProto.clone(), sx * (w * 0.5 - 0.35), h * 0.5 + 0.15, sz * (d * 0.5 - 0.35))
              );
            }
          }
        }
      }

      for (const [m, arr] of localBuckets.entries()) {
        const merged = arr.length === 1 ? arr[0] : mergeGeometries(arr, false);
        if (merged) {
          if (arr.length > 1) arr.forEach((g) => g.dispose());
          const subMesh = new THREE.Mesh(merged, m);
          subMesh.receiveShadow = true;
          group.add(subMesh);
          this.levelDisposables.push(merged);
        }
      }

      group.rotation.order = 'YXZ';
      let isRotated = false;
      if (p.rotationSpeed) {
        const axis = p.rotationAxis || 'y';
        const phase = p.rotationPhase ?? 0;
        if (axis === 'y') group.rotation.set(0, phase, 0);
        else if (axis === 'x') group.rotation.set(phase, 0, 0);
        else if (axis === 'z') group.rotation.set(0, 0, phase);
        else if (axis === 'xy') group.rotation.set(phase * 0.7, phase, 0);
        else if (axis === 'zy') group.rotation.set(0, phase, phase * 0.7);
        isRotated = true;
      }

      this.levelGroup.add(group);

      const initQuat = group.quaternion.clone();
      const tilted = Boolean(p.rotationSpeed && p.rotationAxis && p.rotationAxis !== 'y');
      const boundRadiusXZ = tilted
        ? Math.hypot(w * 0.5, h * 0.5, d * 0.5)
        : Math.hypot(w * 0.5, d * 0.5);
      const rt: RuntimePlatform = {
        def: p,
        mesh: group,
        material: mat,
        baseColorHex: color,
        boundRadiusXZ,
        currentPos: new THREE.Vector3(px0, py0, pz0),
        prevPos: new THREE.Vector3(px0, py0, pz0),
        currentQuat: initQuat.clone(),
        prevQuat: initQuat.clone(),
        invQuat: initQuat.clone().invert(),
        prevInvQuat: initQuat.clone().invert(),
        isRotated,
        state: 'solid',
        stateTimer: 0,
      };
      this.platforms.push(rt);
      this.dynamicPlatforms.push(rt);
    });

    bollardProto.dispose();
    this.flushStaticChunks(chunkBuckets);
  }

  private buildInnerWalls(def: LevelDef): void {
    const collarMat = new THREE.MeshStandardMaterial({
      map: this.textures.concreteAlbedo,
      bumpMap: this.textures.concreteBump,
      bumpScale: 0.025,
      color: 0x5c686b,
      roughness: 0.78,
      metalness: 0.08,
    });
    const pillarMat = new THREE.MeshStandardMaterial({
      map: this.textures.concreteAlbedo,
      bumpMap: this.textures.concreteBump,
      bumpScale: 0.025,
      color: 0x899497,
      roughness: 0.72,
      metalness: 0.05,
    });
    const wallTileMat = new THREE.MeshStandardMaterial({
      map: this.textures.wallAlbedo,
      bumpMap: this.textures.wallBump,
      bumpScale: 0.025,
      color: 0x9aa9ad,
      roughness: 0.42,
      metalness: 0.05,
    });
    this.injectUnderwaterCaustics(pillarMat, def.bounds.waterY, false);
    this.injectUnderwaterCaustics(wallTileMat, def.bounds.waterY, false);
    this.levelDisposables.push(collarMat, pillarMat, wallTileMat);

    const minZ = def.bounds.minZ;
    const chunkBuckets = new Map<number, Map<THREE.Material, { cast: THREE.BufferGeometry[]; noCast: THREE.BufferGeometry[] }>>();

    def.walls.forEach((w) => {
      const [sx, sy, sz] = w.size;
      const [wx, wy, wz] = w.position;
      const isPillar = w.kind === 'pillar' || w.kind === 'concrete';
      const mat = isPillar ? pillarMat : wallTileMat;
      const chunkIdx = Math.floor((wz - minZ) / CHUNK_Z_SPAN);

      this.addChunkPart(
        chunkBuckets,
        chunkIdx,
        mat,
        this.transformGeo(this.makeTiledBoxGeo(sx, sy, sz, 2.5, 3.0), wx, wy, wz),
        true
      );

      if (w.kind === 'pillar') {
        this.addChunkPart(
          chunkBuckets,
          chunkIdx,
          collarMat,
          this.transformGeo(this.makeTiledBoxGeo(sx + 0.36, 0.65, sz + 0.36, 2.5, 2.5), wx, def.bounds.ceilingY - 0.34, wz),
          false
        );
        this.addChunkPart(
          chunkBuckets,
          chunkIdx,
          collarMat,
          this.transformGeo(this.makeTiledBoxGeo(sx + 0.36, 0.65, sz + 0.36, 2.5, 2.5), wx, def.bounds.waterY + 0.12, wz),
          false
        );
      }

      this.walls.push({
        centerX: wx,
        centerZ: wz,
        boundRadiusXZ: Math.hypot(sx * 0.5, sz * 0.5),
        minX: wx - sx * 0.5,
        maxX: wx + sx * 0.5,
        minY: wy - sy * 0.5,
        maxY: wy + sy * 0.5,
        minZ: wz - sz * 0.5,
        maxZ: wz + sz * 0.5,
      });
    });

    this.flushStaticChunks(chunkBuckets);
  }

  private respawnAtActiveCheckpoint(playSound = true): void {
    this.playerPos.copy(this.activeSpawn);
    this.playerVel.set(0, 0, 0);
    this.playerYaw = Math.PI;
    this.camYaw = 0;
    this.camPitch = 0.25;
    this.grounded = false;
    this.stoodPlatform = null;
    this.inWater = false;
    this.wasInWater = false;
    this.waterJumpTimer = 0;
    this.waterJumpCooldown = 0;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.stamina = 100;
    this.exhausted = false;
    this.playerRig.root.scale.setScalar(1);
    this.playerRig.setVisible(this.phase !== 'menu');
    this.playerRig.root.position.copy(this.playerPos);
    this.playerRig.root.rotation.set(0, this.playerYaw, 0);
    if (playSound) this.sound.playCheckpoint();
  }

  private spawnSplash(pos: THREE.Vector3, count: number, strength = 1): void {
    let spawned = 0;
    const cap = Math.min(this.splashPool.length, this.splashMaxActive);
    const waterY = this.currentLevel.bounds.waterY + 0.05;
    for (let i = 0; i < cap && spawned < count; i++) {
      const p = this.splashPool[i];
      if (p.life <= 0) {
        p.life = 0.45 + Math.random() * 0.3;
        p.maxLife = p.life;
        p.pos.set(
          pos.x + (Math.random() - 0.5) * 0.6,
          waterY,
          pos.z + (Math.random() - 0.5) * 0.6
        );
        const angle = Math.random() * Math.PI * 2;
        const spd = (1.2 + Math.random() * 2.2) * strength;
        p.vel.set(Math.cos(angle) * spd, (2.4 + Math.random() * 2.8) * strength, Math.sin(angle) * spd);
        spawned++;
      }
    }
  }

  private cancelScheduledTick(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.timerId) {
      window.clearTimeout(this.timerId);
      this.timerId = 0;
    }
    if (this.pendingSync) {
      const gl = this.renderer.getContext() as WebGL2RenderingContext | null;
      if (gl && typeof gl.deleteSync === 'function') {
        try {
          gl.deleteSync(this.pendingSync);
        } catch {
          // ignore if context was lost
        }
      }
      this.pendingSync = null;
    }
  }

  private scheduleNextTick(immediate = false): void {
    if (this.disposed) return;
    this.cancelScheduledTick();
    if (this.isSoftwareGl && !immediate) {
      this.afterDraw(() => this.tick());
    } else {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = 0;
        this.tick();
      });
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext | null;
    if (!gl || gl.isContextLost?.() || typeof gl.fenceSync !== 'function') {
      this.timerId = window.setTimeout(() => {
        this.timerId = 0;
        cb();
      }, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!sync) {
      this.timerId = window.setTimeout(() => {
        this.timerId = 0;
        cb();
      }, 80);
      return;
    }
    this.pendingSync = sync;
    gl.flush();
    const startedAt = performance.now();
    let polls = 0;
    const poll = () => {
      this.timerId = 0;
      if (this.disposed || this.pendingSync !== sync) return;
      if (gl.isContextLost?.()) {
        this.pendingSync = null;
        this.timerId = window.setTimeout(() => {
          this.timerId = 0;
          cb();
        }, 80);
        return;
      }
      polls++;
      const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED && polls < 32 && performance.now() - startedAt < 180) {
        this.timerId = window.setTimeout(poll, 5);
      } else {
        try {
          gl.deleteSync(sync);
        } catch {
          // ignore
        }
        if (this.pendingSync === sync) {
          this.pendingSync = null;
        }
        this.timerId = window.setTimeout(() => {
          this.timerId = 0;
          cb();
        }, 80);
      }
    };
    this.timerId = window.setTimeout(poll, 5);
  }

  private tick(): void {
    if (this.disposed) return;

    const nowMs = performance.now();
    const rawDt = Math.max(0.001, (nowMs - this.lastTimeMs) / 1000);
    this.lastTimeMs = nowMs;
    const dt = Math.min(rawDt, 0.05);

    if (this.phase !== 'paused') {
      this.simTime += dt;
    }
    if (this.phase === 'playing') {
      this.platformTime += dt;
    }
    this.renderFrameIdx++;

    // Track FPS & adaptive quality with hysteresis
    this.fpsSamples.push(1 / rawDt);
    if (this.fpsSamples.length > 24) this.fpsSamples.shift();
    if (this.qualityCooldownTimer > 0) {
      this.qualityCooldownTimer = Math.max(0, this.qualityCooldownTimer - dt);
    }
    if (rawDt > 0.045 && this.phase === 'playing') {
      this.slowFrameCount++;
    } else if (this.slowFrameCount > 0) {
      this.slowFrameCount = Math.max(0, this.slowFrameCount - 1);
    }

    this.qualityEvalTimer += dt;
    if (this.qualityEvalTimer >= 1.5) {
      this.qualityEvalTimer = 0;
      const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
      this.currentFps = Math.round(avg);
      if (this.settings.quality === 'auto' && !this.isSoftwareGl && this.phase === 'playing' && this.qualityCooldownTimer <= 0) {
        if ((avg < 38 || this.slowFrameCount >= 8) && this.activeQuality !== 'smooth') {
          this.activeQuality = this.activeQuality === 'ultra' ? 'standard' : 'smooth';
          this.qualityCooldownTimer = 6;
          this.slowFrameCount = 0;
          this.highFpsStreak = 0;
          this.applyQualityToRenderer();
        } else if (avg > 56 && this.activeQuality !== 'ultra') {
          this.highFpsStreak++;
          if (this.highFpsStreak >= 3) {
            this.activeQuality = this.activeQuality === 'smooth' ? 'standard' : 'ultra';
            this.qualityCooldownTimer = 8;
            this.highFpsStreak = 0;
            this.applyQualityToRenderer();
          }
        } else {
          this.highFpsStreak = 0;
        }
      }
    }

    // Animate water surface & splash particles only when not paused
    if (this.phase !== 'paused') {
      this.updateEnvironmentFX(dt);
      this.updateSplashParticles(dt);
    }

    if (this.phase === 'menu') {
      this.updateMenuCamera();
      this.updateMonsters(dt, false);
      this.sound.updateAtmosphere(this.simTime, 30, 'calm', false, false, false);
    } else if (this.phase === 'playing') {
      this.levelTimeElapsed += dt;
      if (this.isMultiplayer) {
        this.updatePlatforms(dt);
        if (this.mpLocalAlive && !this.mpLocalBeingEaten && !this.mpLocalEscaped) {
          this.updatePlayer(dt);
          this.updateCheckpoints(dt);
          this.checkExit();
        }
        this.updateRemotePlayers(dt);
        this.updateMultiplayerMonsters(dt);
        this.updatePlayCamera(dt);

        if (this.mpLocalAlive && !this.mpLocalBeingEaten) {
          this.mpSendTimer += dt;
          if (this.mpSendTimer >= 0.045) {
            this.mpSendTimer = 0;
            const qx = Math.round(this.playerPos.x * 1000) / 1000;
            const qy = Math.round(this.playerPos.y * 1000) / 1000;
            const qz = Math.round(this.playerPos.z * 1000) / 1000;
            const qyaw = Math.round(this.playerYaw * 1000) / 1000;
            const qspd = Math.round(this.mpLastHorizSpeed * 100) / 100;
            const changed =
              qx !== this.mpLastSentX ||
              qy !== this.mpLastSentY ||
              qz !== this.mpLastSentZ ||
              Math.abs(shortestAngleDiff(this.mpLastSentYaw, qyaw)) > 0.004 ||
              this.mpLastAnimState !== this.mpLastSentAnim ||
              this.inWater !== this.mpLastSentInWater ||
              this.activeCheckpointIndex !== this.mpLastSentCp ||
              this.mpLocalEscaped;
            if (changed || nowMs - this.mpLastSentTime >= 350) {
              this.mpLastSentTime = nowMs;
              this.mpLastSentX = qx;
              this.mpLastSentY = qy;
              this.mpLastSentZ = qz;
              this.mpLastSentYaw = qyaw;
              this.mpLastSentAnim = this.mpLastAnimState;
              this.mpLastSentInWater = this.inWater;
              this.mpLastSentCp = this.activeCheckpointIndex;
              this.callbacks.onMultiplayerTick?.({
                x: qx,
                y: qy,
                z: qz,
                yaw: qyaw,
                animState: this.mpLastAnimState,
                horizSpeed: qspd,
                inWater: this.inWater,
                checkpointIndex: this.activeCheckpointIndex,
                escaped: this.mpLocalEscaped,
              });
            }
          }
        }
      } else {
        this.levelTimeRemaining -= dt;
        if (this.levelTimeRemaining <= 0) {
          this.levelTimeRemaining = 0;
          this.triggerDeath('timeout', this.monsters[0] || null);
          if ((this.phase as GamePhase) === 'jumpscare') {
            this.updateJumpscare(0);
          }
        } else {
          this.updatePlatforms(dt);
          this.updatePlayer(dt);
          this.updateCheckpoints(dt);
          this.updateMonsters(dt, true);
          if ((this.phase as GamePhase) === 'playing') {
            this.updatePlayCamera(dt);
            this.checkExit();
          } else if ((this.phase as GamePhase) === 'jumpscare') {
            this.updateJumpscare(0);
          }
        }
      }
    } else if (this.phase === 'jumpscare') {
      this.levelTimeElapsed += dt;
      this.updatePlatforms(dt);
      if (this.isMultiplayer) {
        this.updateRemotePlayers(dt);
        this.updateMultiplayerMonsters(dt, this.jumpscareMonster);
      } else {
        this.animateSecondaryMonstersDuringEat(dt);
      }
      this.updateJumpscare(dt);
    }

    const gl = this.renderer.getContext() as WebGL2RenderingContext | null;
    if (!gl || !gl.isContextLost?.()) {
      this.renderer.render(this.scene, this.camera);
    }

    if (this.phase === 'playing' || this.phase === 'jumpscare') {
      this.hudEmitTimer += dt;
      if (this.hudEmitTimer >= 0.06) {
        this.hudEmitTimer = 0;
        this.emitHud();
      }
    }

    this.scheduleNextTick(false);
  }

  private updateEnvironmentFX(dt: number): void {
    // Water wave shader + real-time serpent displacement wake + underwater caustics + normal scroll
    if (this.waterMat?.userData.shader) {
      const sh = this.waterMat.userData.shader;
      sh.uniforms.uTime.value = this.simTime;
      let wakeMonster = this.monsters[0] || null;
      let bestScore = -Infinity;
      for (let i = 0; i < this.monsters.length; i++) {
        const m = this.monsters[i];
        const d = Math.hypot(this.playerPos.x - m.pos.x, this.playerPos.z - m.pos.z);
        const sc = (m.alert === 'chasing' ? 1000 : 0) - d;
        if (sc > bestScore) {
          bestScore = sc;
          wakeMonster = m;
        }
      }
      if (wakeMonster) {
        sh.uniforms.uSerpentHead.value.set(wakeMonster.pos.x, wakeMonster.pos.z);
        sh.uniforms.uSerpentDir.value.set(Math.sin(wakeMonster.yaw), Math.cos(wakeMonster.yaw));
        const targetWake = wakeMonster.alert === 'chasing' ? 1.45 : 0.28;
        sh.uniforms.uSerpentWake.value = THREE.MathUtils.lerp(
          sh.uniforms.uSerpentWake.value,
          targetWake,
          Math.min(1, dt * 12)
        );
      } else {
        sh.uniforms.uSerpentWake.value = 0;
      }
    }
    this.uCausticTime.value = this.simTime;
    this.textures.waterNormal.offset.x = (this.simTime * 0.025) % 1;
    this.textures.waterNormal.offset.y = (this.simTime * 0.018) % 1;

    // Dynamic underwater fog murkiness transition when camera dives below water surface
    if (this.scene.fog instanceof THREE.FogExp2 && this.scene.background instanceof THREE.Color) {
      const underwater = this.camera.position.y < this.currentLevel.bounds.waterY - 0.04;
      const targetDensity = underwater
        ? Math.min(0.065, this.currentLevel.fogDensity * 2.55)
        : this.currentLevel.fogDensity;
      const targetColor = underwater ? this.underwaterFogColor : this.baseFogColor;
      const kFog = Math.min(1, dt * 8);
      this.scene.fog.density = THREE.MathUtils.lerp(this.scene.fog.density, targetDensity, kFog);
      this.scene.fog.color.lerp(targetColor, kFog);
      this.scene.background.lerp(targetColor, kFog);
    }

    // Follow player with shadow-casting DirectionalLight (snapped to texel grid to prevent shadow shimmer)
    if (this.keyLight) {
      const snapX = Math.round(this.playerPos.x * 2) * 0.5;
      const snapZ = Math.round(this.playerPos.z * 2) * 0.5;
      this.keyLight.position.set(snapX + 16, 26, snapZ + 20);
      this.keyLight.target.position.set(snapX, 0, snapZ);
    }

    // Assign active pooled PointLights to nearest fixtures/checkpoints/exit around camera
    if (this.pointLightPool.length > 0 && this.levelLights.length > 0) {
      const cx = this.camera.position.x;
      const cz = this.camera.position.z;
      const activeLimit = Math.min(this.pointLightPool.length, this.activePointLightLimit);
      _pickedLights.length = 0;
      for (let slot = 0; slot < this.pointLightPool.length; slot++) {
        const pl = this.pointLightPool[slot];
        if (slot >= activeLimit) {
          pl.intensity = 0;
          continue;
        }
        let bestIdx = -1;
        let bestD2 = Infinity;
        for (let i = 0; i < this.levelLights.length; i++) {
          if (_pickedLights.includes(i)) continue;
          const l = this.levelLights[i];
          const dx = l.x - cx;
          const dz = l.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 < bestD2) {
            bestD2 = d2;
            bestIdx = i;
          }
        }
        if (bestIdx >= 0) {
          _pickedLights.push(bestIdx);
          const src = this.levelLights[bestIdx];
          pl.position.set(src.x, src.y, src.z);
          if (src.checkpointIdx !== undefined) {
            const cp = this.checkpoints[src.checkpointIdx];
            if (cp) pl.color.copy(cp.lightColor);
          } else {
            pl.color.copy(src.color);
          }
          let intensity = src.baseIntensity;
          if (src.flickering) {
            const wave =
              Math.sin(this.simTime * 17 + src.seed) * 0.5 +
              Math.sin(this.simTime * 43 + src.seed * 2) * 0.5;
            if (wave > 0.72) intensity *= 0.28;
          }
          pl.intensity = intensity;
        } else {
          pl.intensity = 0;
        }
      }
    }

    // Checkpoint beacon spin
    for (const cp of this.checkpoints) {
      cp.ring.rotation.z += dt * 1.4;
      cp.ring.position.y = 0.9 + Math.sin(this.simTime * 2.5) * 0.08;
    }
  }

  private updateSplashParticles(dt: number): void {
    let activeCount = 0;
    for (let i = 0; i < this.splashPool.length; i++) {
      const p = this.splashPool[i];
      if (p.life > 0) {
        p.life -= dt;
        if (p.life > 0) {
          p.vel.y -= 12 * dt;
          p.pos.addScaledVector(p.vel, dt);
          const s = (p.life / p.maxLife) * 0.9;
          _vSplashScale.setScalar(s);
          _mSplash.compose(p.pos, _qIdentity, _vSplashScale);
          this.splashMesh.setMatrixAt(activeCount++, _mSplash);
        }
      }
    }
    this.splashMesh.count = activeCount;
    if (activeCount > 0 || this.splashMesh.userData.hadActive) {
      this.splashMesh.instanceMatrix.needsUpdate = true;
    }
    this.splashMesh.userData.hadActive = activeCount > 0;
  }

  private updateMenuCamera(): void {
    const t = this.simTime * 0.16;
    const focusZ = Math.max(this.currentLevel.bounds.minZ + 35, -34);
    this.camera.position.set(Math.sin(t) * 9.5, 4.8 + Math.sin(t * 1.5) * 0.5, focusZ + 18 + Math.cos(t) * 6);
    this.camera.lookAt(0, 1.5, focusZ - 14);
  }

  private updatePlatforms(dt: number): void {
    for (const p of this.dynamicPlatforms) {
      p.prevPos.copy(p.currentPos);
      p.prevQuat.copy(p.currentQuat);
      p.prevInvQuat.copy(p.invQuat);

      if (p.def.kind === 'moving' && p.def.moveOffset) {
        const speed = p.def.moveSpeed ?? 1.0;
        const phase = p.def.movePhase ?? 0;
        const factor = 0.5 - 0.5 * Math.cos(this.platformTime * speed + phase);
        p.currentPos.set(
          p.def.position[0] + p.def.moveOffset[0] * factor,
          p.def.position[1] + p.def.moveOffset[1] * factor,
          p.def.position[2] + p.def.moveOffset[2] * factor
        );
        p.mesh.position.copy(p.currentPos);
      } else if (p.def.kind === 'disappearing') {
        if (p.state === 'warning') {
          p.stateTimer -= dt;
          const pulse = 0.5 + 0.5 * Math.sin(this.simTime * 14);
          p.material.color.setHex(0xd96b52);
          p.material.emissive.setHex(0xcc3a1e);
          p.material.emissiveIntensity = 0.45 + pulse * 0.85;
          p.mesh.position.copy(p.currentPos);
          if (p.stateTimer <= 0) {
            p.state = 'gone';
            p.stateTimer = p.def.respawnDelay ?? 2.4;
            p.mesh.visible = false;
            p.material.emissive.setHex(0x000000);
            p.material.emissiveIntensity = 0;
          }
        } else if (p.state === 'gone') {
          p.stateTimer -= dt;
          if (p.stateTimer <= 0) {
            p.state = 'solid';
            p.mesh.visible = true;
            p.mesh.position.copy(p.currentPos);
            p.material.color.setHex(p.baseColorHex);
            p.material.emissive.setHex(0x000000);
            p.material.emissiveIntensity = 0;
          }
        }
      }

      if (p.def.rotationSpeed) {
        const axis = p.def.rotationAxis || 'y';
        const spd = p.def.rotationSpeed;
        const phase = p.def.rotationPhase ?? 0;
        const ang = phase + this.platformTime * spd;
        if (axis === 'y') {
          p.mesh.rotation.set(0, ang, 0);
        } else if (axis === 'x') {
          p.mesh.rotation.set(ang, 0, 0);
        } else if (axis === 'z') {
          p.mesh.rotation.set(0, 0, ang);
        } else if (axis === 'xy') {
          p.mesh.rotation.set(phase * 0.7 + this.platformTime * spd * 0.55, ang, 0);
        } else if (axis === 'zy') {
          p.mesh.rotation.set(0, ang, phase * 0.7 + this.platformTime * spd * 0.55);
        }
        p.currentQuat.copy(p.mesh.quaternion);
        p.invQuat.copy(p.currentQuat).invert();
        p.isRotated = true;
      }
    }
  }

  private populateNearbyObstacles(cx: number, cz: number, range: number): void {
    _nearPlatforms.length = 0;
    _nearWalls.length = 0;
    if (this.spatialGrid) {
      this.spatialGrid.queryRadius(cx, cz, range, _nearPlatIdx, _nearWallIdx);
      for (let i = 0; i < _nearPlatIdx.length; i++) {
        const p = this.platforms[_nearPlatIdx[i]];
        if (!p || p.state === 'gone') continue;
        const r = range + p.boundRadiusXZ;
        const dx = p.currentPos.x - cx;
        const dz = p.currentPos.z - cz;
        if (dx * dx + dz * dz <= r * r) {
          _nearPlatforms.push(p);
        }
      }
      for (let i = 0; i < _nearWallIdx.length; i++) {
        const w = this.walls[_nearWallIdx[i]];
        if (!w) continue;
        const r = range + w.boundRadiusXZ;
        const dx = w.centerX - cx;
        const dz = w.centerZ - cz;
        if (dx * dx + dz * dz <= r * r) {
          _nearWalls.push(w);
        }
      }
      return;
    }

    for (let i = 0; i < this.platforms.length; i++) {
      const p = this.platforms[i];
      if (p.state === 'gone') continue;
      const r = range + p.boundRadiusXZ;
      const dx = p.currentPos.x - cx;
      const dz = p.currentPos.z - cz;
      if (dx * dx + dz * dz <= r * r) {
        _nearPlatforms.push(p);
      }
    }
    for (let i = 0; i < this.walls.length; i++) {
      const w = this.walls[i];
      const r = range + w.boundRadiusXZ;
      const dx = w.centerX - cx;
      const dz = w.centerZ - cz;
      if (dx * dx + dz * dz <= r * r) {
        _nearWalls.push(w);
      }
    }
  }

  private isCircleBlocked(
    x: number,
    z: number,
    radius: number,
    botY: number,
    topY: number,
    platList: RuntimePlatform[] = this.platforms,
    wallList: RuntimeWall[] = this.walls
  ): boolean {
    const b = this.currentLevel.bounds;
    if (x < b.minX + radius || x > b.maxX - radius || z < b.minZ + radius || z > b.maxZ - radius) {
      return true;
    }

    const rSq = radius * radius;
    for (let i = 0; i < wallList.length; i++) {
      const w = wallList[i];
      if (w.maxY <= botY + 0.05 || w.minY >= topY - 0.05) continue;
      const bdx = x - w.centerX;
      const bdz = z - w.centerZ;
      const br = w.boundRadiusXZ + radius;
      if (bdx * bdx + bdz * bdz > br * br) continue;
      const cx = Math.max(w.minX, Math.min(x, w.maxX));
      const cz = Math.max(w.minZ, Math.min(z, w.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < rSq) return true;
    }

    for (let i = 0; i < platList.length; i++) {
      const p = platList[i];
      if (p.state === 'gone') continue;
      const bdx = x - p.currentPos.x;
      const bdz = z - p.currentPos.z;
      const br = p.boundRadiusXZ + radius;
      if (bdx * bdx + bdz * bdz > br * br) continue;
      const [pw, ph, pd] = p.def.size;
      const hw = pw * 0.5;
      const hh = ph * 0.5;
      const hd = pd * 0.5;

      if (!p.isRotated || p.def.rotationAxis === 'y') {
        const pBotY = p.currentPos.y - hh;
        const pTopY = p.currentPos.y + hh;
        if (pTopY <= botY + 0.05 || pBotY >= topY - 0.05) continue;

        if (!p.isRotated) {
          const lx = x - p.currentPos.x;
          const lz = z - p.currentPos.z;
          const clx = Math.max(-hw, Math.min(lx, hw));
          const clz = Math.max(-hd, Math.min(lz, hd));
          const dlx = lx - clx;
          const dlz = lz - clz;
          if (dlx * dlx + dlz * dlz < rSq) return true;
        } else {
          _vLocal.set(x - p.currentPos.x, 0, z - p.currentPos.z).applyQuaternion(p.invQuat);
          const clx = Math.max(-hw, Math.min(_vLocal.x, hw));
          const clz = Math.max(-hd, Math.min(_vLocal.z, hd));
          const dlx = _vLocal.x - clx;
          const dlz = _vLocal.z - clz;
          if (dlx * dlx + dlz * dlz < rSq) return true;
        }
      } else {
        const spanY = Math.max(0.1, topY - botY);
        const padY = Math.min(radius * 0.5, spanY * 0.25);
        const yMin = botY + padY;
        const yMax = topY - padY;
        const numSamples = Math.max(3, Math.min(6, Math.ceil((yMax - yMin) / Math.max(0.25, radius * 1.4)) + 1));
        for (let sIdx = 0; sIdx < numSamples; sIdx++) {
          const sy = yMin + ((yMax - yMin) * sIdx) / (numSamples - 1);
          _vLocal.set(x - p.currentPos.x, sy - p.currentPos.y, z - p.currentPos.z).applyQuaternion(p.invQuat);
          const clx = Math.max(-hw, Math.min(_vLocal.x, hw));
          const cly = Math.max(-hh, Math.min(_vLocal.y, hh));
          const clz = Math.max(-hd, Math.min(_vLocal.z, hd));
          const dlx = _vLocal.x - clx;
          const dly = _vLocal.y - cly;
          const dlz = _vLocal.z - clz;
          if (dlx * dlx + dly * dly + dlz * dlz < rSq) return true;
        }
      }
    }

    return false;
  }

  private resolveCircleSolids(
    pos: THREE.Vector3,
    radius: number,
    botY: number,
    topY: number,
    boundsMargin: number,
    includePlatforms: boolean,
    vel?: THREE.Vector3,
    minPlatformTopForSide = -Infinity,
    skipPlatform: RuntimePlatform | null = null,
    platList: RuntimePlatform[] = this.platforms,
    wallList: RuntimeWall[] = this.walls
  ): void {
    const b = this.currentLevel.bounds;
    const rSq = radius * radius;

    for (let iter = 0; iter < 2; iter++) {
      // 1. Active platforms (exact circle vs OBB push-out)
      if (includePlatforms) {
        for (let i = 0; i < platList.length; i++) {
          const p = platList[i];
          if (p.state === 'gone' || p === skipPlatform) continue;
          const bdx = pos.x - p.currentPos.x;
          const bdz = pos.z - p.currentPos.z;
          const br = p.boundRadiusXZ + radius;
          if (bdx * bdx + bdz * bdz > br * br) continue;
          const [pw, ph, pd] = p.def.size;
          const hw = pw * 0.5;
          const hh = ph * 0.5;
          const hd = pd * 0.5;

          if (!p.isRotated || p.def.rotationAxis === 'y') {
            const pBotY = p.currentPos.y - hh;
            const pTopY = p.currentPos.y + hh;
            if (pTopY <= botY || pBotY >= topY || pTopY <= minPlatformTopForSide) continue;

            if (!p.isRotated) {
              const lx = pos.x - p.currentPos.x;
              const lz = pos.z - p.currentPos.z;
              const clx = Math.max(-hw, Math.min(lx, hw));
              const clz = Math.max(-hd, Math.min(lz, hd));
              const dlx = lx - clx;
              const dlz = lz - clz;
              const dSq = dlx * dlx + dlz * dlz;

              if (dSq < rSq) {
                let wx = 0;
                let wz = 0;
                if (dSq > 1e-8) {
                  const d = Math.sqrt(dSq);
                  const pen = radius - d;
                  wx = (dlx / d) * pen;
                  wz = (dlz / d) * pen;
                } else {
                  const penX = hw + radius - Math.abs(lx);
                  const penZ = hd + radius - Math.abs(lz);
                  if (penX < penZ) wx = lx >= 0 ? penX : -penX;
                  else wz = lz >= 0 ? penZ : -penZ;
                }

                pos.x += wx;
                pos.z += wz;

                if (vel) {
                  const wLen = Math.hypot(wx, wz);
                  if (wLen > 1e-6) {
                    const nx = wx / wLen;
                    const nz = wz / wLen;
                    const vn = vel.x * nx + vel.z * nz;
                    if (vn < 0) {
                      vel.x -= vn * nx;
                      vel.z -= vn * nz;
                    }
                  }
                }
              }
            } else {
              _vLocal.set(pos.x - p.currentPos.x, 0, pos.z - p.currentPos.z).applyQuaternion(p.invQuat);
              const clx = Math.max(-hw, Math.min(_vLocal.x, hw));
              const clz = Math.max(-hd, Math.min(_vLocal.z, hd));
              const dlx = _vLocal.x - clx;
              const dlz = _vLocal.z - clz;
              const dSq = dlx * dlx + dlz * dlz;

              if (dSq < rSq) {
                let lwx = 0;
                let lwz = 0;
                if (dSq > 1e-8) {
                  const d = Math.sqrt(dSq);
                  const pen = radius - d;
                  lwx = (dlx / d) * pen;
                  lwz = (dlz / d) * pen;
                } else {
                  const penX = hw + radius - Math.abs(_vLocal.x);
                  const penZ = hd + radius - Math.abs(_vLocal.z);
                  if (penX < penZ) lwx = _vLocal.x >= 0 ? penX : -penX;
                  else lwz = _vLocal.z >= 0 ? penZ : -penZ;
                }
                _vLocal.set(lwx, 0, lwz).applyQuaternion(p.currentQuat);
                const wx = _vLocal.x;
                const wz = _vLocal.z;
                pos.x += wx;
                pos.z += wz;

                if (vel) {
                  const wLen = Math.hypot(wx, wz);
                  if (wLen > 1e-6) {
                    const nx = wx / wLen;
                    const nz = wz / wLen;
                    const vn = vel.x * nx + vel.z * nz;
                    if (vn < 0) {
                      vel.x -= vn * nx;
                      vel.z -= vn * nz;
                    }
                  }
                }
              }
            }
          } else {
            // Multi-sphere vertical capsule vs 3D OBB push-out for X/Z/compound rotating platforms
            const effBotY = minPlatformTopForSide > -Infinity ? Math.max(botY, minPlatformTopForSide) : botY;
            if (topY <= effBotY) continue;
            const spanY = topY - effBotY;
            const padY = Math.min(radius * 0.5, spanY * 0.25);
            const yMin = effBotY + padY;
            const yMax = topY - padY;
            const numSamples = Math.max(4, Math.min(6, Math.ceil((yMax - yMin) / Math.max(0.25, radius * 1.4)) + 1));

            let bestDSq = rSq;
            let bestLwx = 0;
            let bestLwy = 0;
            let bestLwz = 0;
            let bestPen = 0;

            for (let sIdx = 0; sIdx < numSamples; sIdx++) {
              const sy = yMin + ((yMax - yMin) * sIdx) / (numSamples - 1);
              _vLocal
                .set(pos.x - p.currentPos.x, sy - p.currentPos.y, pos.z - p.currentPos.z)
                .applyQuaternion(p.invQuat);
              const clx = Math.max(-hw, Math.min(_vLocal.x, hw));
              const cly = Math.max(-hh, Math.min(_vLocal.y, hh));
              const clz = Math.max(-hd, Math.min(_vLocal.z, hd));
              const dlx = _vLocal.x - clx;
              const dly = _vLocal.y - cly;
              const dlz = _vLocal.z - clz;
              const dSq = dlx * dlx + dly * dly + dlz * dlz;
              if (dSq < bestDSq) {
                bestDSq = dSq;
                if (dSq > 1e-8) {
                  const d = Math.sqrt(dSq);
                  const pen = radius - d;
                  bestPen = pen;
                  bestLwx = (dlx / d) * pen;
                  bestLwy = (dly / d) * pen;
                  bestLwz = (dlz / d) * pen;
                } else {
                  const penX = hw + radius - Math.abs(_vLocal.x);
                  const penY = hh + radius - Math.abs(_vLocal.y);
                  const penZ = hd + radius - Math.abs(_vLocal.z);
                  bestLwx = 0;
                  bestLwy = 0;
                  bestLwz = 0;
                  if (penX <= penY && penX <= penZ) {
                    bestPen = penX;
                    bestLwx = _vLocal.x >= 0 ? penX : -penX;
                  } else if (penZ <= penY && penZ <= penX) {
                    bestPen = penZ;
                    bestLwz = _vLocal.z >= 0 ? penZ : -penZ;
                  } else {
                    bestPen = penY;
                    bestLwy = _vLocal.y >= 0 ? penY : -penY;
                  }
                }
              }
            }

            if (bestDSq < rSq) {
              _vLocal.set(bestLwx, bestLwy, bestLwz).applyQuaternion(p.currentQuat);
              const wx = _vLocal.x;
              const wy = _vLocal.y;
              const wz = _vLocal.z;
              pos.x += wx;
              pos.z += wz;
              if (wy < -0.35 * bestPen && vel && vel.y > 0) {
                pos.y += wy;
                vel.y = 0;
              }
              if (vel) {
                const wLen = Math.hypot(wx, wz);
                if (wLen > 1e-6) {
                  const nx = wx / wLen;
                  const nz = wz / wLen;
                  const vn = vel.x * nx + vel.z * nz;
                  if (vn < 0) {
                    vel.x -= vn * nx;
                    vel.z -= vn * nz;
                  }
                }
              }
            }
          }
        }
      }

      // 2. Inner walls & pillars (exact circle vs AABB push-out)
      for (let i = 0; i < wallList.length; i++) {
        const w = wallList[i];
        if (w.maxY <= botY + 0.05 || w.minY >= topY - 0.05) continue;
        const bdx = pos.x - w.centerX;
        const bdz = pos.z - w.centerZ;
        const br = w.boundRadiusXZ + radius;
        if (bdx * bdx + bdz * bdz > br * br) continue;
        const cx = Math.max(w.minX, Math.min(pos.x, w.maxX));
        const cz = Math.max(w.minZ, Math.min(pos.z, w.maxZ));
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const dSq = dx * dx + dz * dz;

        if (dSq < rSq) {
          let wx = 0;
          let wz = 0;
          if (dSq > 1e-8) {
            const d = Math.sqrt(dSq);
            const pen = radius - d;
            wx = (dx / d) * pen;
            wz = (dz / d) * pen;
          } else {
            const dLeft = pos.x - (w.minX - radius);
            const dRight = w.maxX + radius - pos.x;
            const dFront = pos.z - (w.minZ - radius);
            const dBack = w.maxZ + radius - pos.z;
            const minPen = Math.min(dLeft, dRight, dFront, dBack);
            if (minPen === dLeft) wx = -dLeft;
            else if (minPen === dRight) wx = dRight;
            else if (minPen === dFront) wz = -dFront;
            else wz = dBack;
          }

          pos.x += wx;
          pos.z += wz;

          if (vel) {
            const wLen = Math.hypot(wx, wz);
            if (wLen > 1e-6) {
              const nx = wx / wLen;
              const nz = wz / wLen;
              const vn = vel.x * nx + vel.z * nz;
              if (vn < 0) {
                vel.x -= vn * nx;
                vel.z -= vn * nz;
              }
            }
          }
        }
      }

      // 3. Pool outer bounds
      const minBX = b.minX + boundsMargin;
      const maxBX = b.maxX - boundsMargin;
      const minBZ = b.minZ + boundsMargin;
      const maxBZ = b.maxZ - boundsMargin;
      if (pos.x < minBX) {
        pos.x = minBX;
        if (vel && vel.x < 0) vel.x = 0;
      } else if (pos.x > maxBX) {
        pos.x = maxBX;
        if (vel && vel.x > 0) vel.x = 0;
      }
      if (pos.z < minBZ) {
        pos.z = minBZ;
        if (vel && vel.z < 0) vel.z = 0;
      } else if (pos.z > maxBZ) {
        pos.z = maxBZ;
        if (vel && vel.z > 0) vel.z = 0;
      }
    }
  }

  private updatePlayer(dt: number): void {
    const waterY = this.currentLevel.bounds.waterY;
    const playerRadius = 0.34;
    const playerHeight = 1.75;
    const gravity = 18.5;
    const groundJumpVel = 10.4;
    const waterJumpVel = 10.8;
    const targetSwimY = waterY - 0.45;

    if (this.waterJumpTimer > 0) {
      this.waterJumpTimer = Math.max(0, this.waterJumpTimer - dt);
    }
    if (this.waterJumpCooldown > 0) {
      this.waterJumpCooldown = Math.max(0, this.waterJumpCooldown - dt);
    }
    if (this.pushCooldownTimer > 0) {
      this.pushCooldownTimer = Math.max(0, this.pushCooldownTimer - dt);
    }
    if (this.pushRecoveryTimer > 0) {
      this.pushRecoveryTimer = Math.max(0, this.pushRecoveryTimer - dt);
    }
    if (this.pushStaggerTimer > 0) {
      this.pushStaggerTimer = Math.max(0, this.pushStaggerTimer - dt);
    }

    // Carry player with stood moving or rotating platform before physics step
    if (this.grounded && this.stoodPlatform && this.stoodPlatform.state !== 'gone') {
      if (this.stoodPlatform.isRotated) {
        _vDelta.subVectors(this.playerPos, this.stoodPlatform.prevPos);
        _qTmp.copy(this.stoodPlatform.prevQuat).invert();
        _vDelta.applyQuaternion(_qTmp);
        _vDelta.applyQuaternion(this.stoodPlatform.currentQuat);
        _vDelta.add(this.stoodPlatform.currentPos);
        this.playerPos.copy(_vDelta);
      } else {
        _vDelta.subVectors(this.stoodPlatform.currentPos, this.stoodPlatform.prevPos);
        this.playerPos.add(_vDelta);
      }
    }

    // 1. Gather movement input
    let inX = this.virtualMove.x;
    let inY = this.virtualMove.y;
    if (this.virtualAutoRun && Math.hypot(inX, inY) <= 0.08) {
      inY = 1;
    }
    if (this.heldKeys.has('KeyA') || this.heldKeys.has('ArrowLeft')) inX -= 1;
    if (this.heldKeys.has('KeyD') || this.heldKeys.has('ArrowRight')) inX += 1;
    if (this.heldKeys.has('KeyW') || this.heldKeys.has('ArrowUp')) inY += 1;
    if (this.heldKeys.has('KeyS') || this.heldKeys.has('ArrowDown')) inY -= 1;

    const inLen = Math.hypot(inX, inY);
    if (inLen > 1) {
      inX /= inLen;
      inY /= inLen;
    }

    const wantsRun =
      (this.heldKeys.has('ShiftLeft') ||
        this.heldKeys.has('ShiftRight') ||
        this.virtualRun ||
        this.virtualAutoRun) &&
      inLen > 0.1 &&
      !this.inWater &&
      !this.exhausted;

    if (wantsRun) {
      this.stamina = Math.max(0, this.stamina - 28 * dt);
      if (this.stamina <= 0) this.exhausted = true;
    } else {
      this.stamina = Math.min(100, this.stamina + 20 * dt);
      if (this.exhausted && this.stamina >= 25) this.exhausted = false;
    }

    // Camera-relative world movement direction on XZ
    _vForward.set(-Math.sin(this.camYaw), 0, -Math.cos(this.camYaw));
    _vRight.set(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    _vMove.set(0, 0, 0).addScaledVector(_vRight, inX).addScaledVector(_vForward, inY);
    const moveMag = Math.min(1, _vMove.length());
    if (moveMag > 0.001) _vMove.normalize();

    const maxSpeed = this.inWater ? 3.8 : wantsRun ? 8.8 : 5.7;
    const accel =
      this.pushStaggerTimer > 0
        ? this.inWater
          ? 6.5
          : 2.4
        : this.grounded
          ? 36
          : this.inWater
            ? 18
            : 22;

    const targetVx = _vMove.x * maxSpeed * moveMag;
    const targetVz = _vMove.z * maxSpeed * moveMag;
    this.playerVel.x = THREE.MathUtils.lerp(this.playerVel.x, targetVx, Math.min(1, accel * dt));
    this.playerVel.z = THREE.MathUtils.lerp(this.playerVel.z, targetVz, Math.min(1, accel * dt));

    // Face character accurately toward movement direction (never walk backwards)
    if (moveMag > 0.08) {
      const targetYaw = Math.atan2(_vMove.x, _vMove.z);
      const diff = shortestAngleDiff(this.playerYaw, targetYaw);
      this.playerYaw += diff * Math.min(1, 16 * dt);
    }

    // 2. Coyote time + Jump buffer (normal platform jumping unchanged; 2s cooldown applies ONLY to water jumps)
    if (this.grounded) this.coyoteTimer = 0.16;
    else this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);

    if (this.jumpBufferTimer > 0) this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);

    const canGroundJump = this.coyoteTimer > 0;
    const canWaterJump = this.inWater && this.waterJumpCooldown <= 0;

    if (this.jumpBufferTimer > 0 && (canGroundJump || canWaterJump)) {
      const jumpedFromWater = !canGroundJump && canWaterJump;
      this.playerVel.y = jumpedFromWater ? waterJumpVel : groundJumpVel;
      if (jumpedFromWater) {
        this.waterJumpTimer = 0.38;
        this.waterJumpCooldown = 2.0;
        this.inWater = false;
      } else {
        this.waterJumpCooldown = 0;
      }
      this.grounded = false;
      this.stoodPlatform = null;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.sound.playJump();
      if (jumpedFromWater) {
        this.spawnSplash(this.playerPos, 8, 0.9);
      }
    }

    // 3. 4-Substep anti-tunneling integration + 3D collision resolution
    const startGrounded = this.grounded;
    const startY = this.playerPos.y;
    const subSteps = 4;
    const subDt = dt / subSteps;

    let finalGrounded = false;
    let finalStood: RuntimePlatform | null = null;

    for (let step = 0; step < subSteps; step++) {
      const prevFeetY = this.playerPos.y;
      _vPrevFeet.copy(this.playerPos);

      // Gravity / Water Buoyancy (never let buoyancy damp an active water jump!)
      if (this.inWater && this.waterJumpTimer <= 0) {
        const depthDiff = targetSwimY - this.playerPos.y;
        this.playerVel.y += (depthDiff * 14 - this.playerVel.y * 4.5) * subDt;
      } else {
        this.playerVel.y -= gravity * subDt;
      }

      this.playerPos.x += this.playerVel.x * subDt;
      this.playerPos.y += this.playerVel.y * subDt;
      this.playerPos.z += this.playerVel.z * subDt;

      // 4A. Spatial-grid query for local platforms & inner walls this substep
      this.populateNearbyObstacles(this.playerPos.x, this.playerPos.z, 6.0);

      let bestTopY = -Infinity;
      let bestPlat: RuntimePlatform | null = null;
      let bestIsTilted = false;
      const landMargin = playerRadius * 1.08;

      for (let i = 0; i < _nearPlatforms.length; i++) {
        const p = _nearPlatforms[i];
        if (p.state === 'gone') continue;
        const bdx = this.playerPos.x - p.currentPos.x;
        const bdz = this.playerPos.z - p.currentPos.z;
        const br = p.boundRadiusXZ + landMargin;
        if (bdx * bdx + bdz * bdz > br * br) continue;

        const [pw, ph, pd] = p.def.size;
        const hw = pw * 0.5;
        const hh = ph * 0.5;
        const hd = pd * 0.5;

        if (!p.isRotated || p.def.rotationAxis === 'y') {
          const topY = p.currentPos.y + hh;
          const prevTopY = p.prevPos.y + hh;
          let lx: number;
          let lz: number;

          if (!p.isRotated) {
            lx = this.playerPos.x - p.currentPos.x;
            lz = this.playerPos.z - p.currentPos.z;
          } else {
            _vLocal.set(this.playerPos.x - p.currentPos.x, 0, this.playerPos.z - p.currentPos.z).applyQuaternion(p.invQuat);
            lx = _vLocal.x;
            lz = _vLocal.z;
          }

          if (Math.abs(lx) <= hw + landMargin && Math.abs(lz) <= hd + landMargin) {
            const minPrevTop = Math.min(prevTopY, topY);
            const fallingLand =
              this.playerVel.y <= 0.6 &&
              prevFeetY >= minPrevTop - 0.36 &&
              this.playerPos.y <= topY + 0.16;
            const stepUp =
              startGrounded &&
              this.playerVel.y <= 1.2 &&
              topY >= this.playerPos.y &&
              topY - this.playerPos.y <= 0.34 &&
              prevFeetY >= topY - 0.34;

            if ((fallingLand || stepUp) && topY > bestTopY) {
              bestTopY = topY;
              bestPlat = p;
              bestIsTilted = false;
            }
          }
        } else {
          // 3D rotated OBB landing (X, Z, XY, ZY axes): evaluate all upward-facing axes smoothly
          _vAxisX.set(1, 0, 0).applyQuaternion(p.currentQuat);
          _vAxisY.set(0, 1, 0).applyQuaternion(p.currentQuat);
          _vAxisZ.set(0, 0, 1).applyQuaternion(p.currentQuat);

          _vLocal.subVectors(this.playerPos, p.currentPos).applyQuaternion(p.invQuat);
          if (step === 0 && p !== this.stoodPlatform) {
            _vLocalPrev.subVectors(_vPrevFeet, p.prevPos).applyQuaternion(p.prevInvQuat);
          } else {
            _vLocalPrev.subVectors(_vPrevFeet, p.currentPos).applyQuaternion(p.invQuat);
          }

          const wasGroundedOnP = startGrounded && this.stoodPlatform === p;
          for (let axisIdx = 0; axisIdx < 3; axisIdx++) {
            const axisVec = axisIdx === 0 ? _vAxisX : axisIdx === 1 ? _vAxisY : _vAxisZ;
            const normalY = Math.abs(axisVec.y);
            if (normalY < 0.52) continue;

            const sign = axisVec.y >= 0 ? 1 : -1;
            _vCandNormal.copy(axisVec).multiplyScalar(sign);

            const faceHalf = axisIdx === 0 ? hw : axisIdx === 1 ? hh : hd;
            const e1 = axisIdx === 0 ? hh : hw;
            const e2 = axisIdx === 2 ? hh : hd;
            const t1 = axisIdx === 0 ? _vLocal.y : _vLocal.x;
            const t2 = axisIdx === 2 ? _vLocal.y : _vLocal.z;
            if (Math.abs(t1) > e1 + landMargin || Math.abs(t2) > e2 + landMargin) continue;

            const sCurr = (axisIdx === 0 ? _vLocal.x : axisIdx === 1 ? _vLocal.y : _vLocal.z) * sign;
            const sPrev = (axisIdx === 0 ? _vLocalPrev.x : axisIdx === 1 ? _vLocalPrev.y : _vLocalPrev.z) * sign;

            const normalVel = this.playerVel.dot(_vCandNormal);
            const stayGrounded =
              wasGroundedOnP &&
              this.playerVel.y <= 1.2 &&
              sCurr >= faceHalf - 0.50 &&
              sCurr <= faceHalf + 0.42;
            const fallingLand =
              normalVel <= 0.85 &&
              sPrev >= faceHalf - 0.42 &&
              sCurr <= faceHalf + 0.24;
            const stepUp =
              startGrounded &&
              this.playerVel.y <= 1.2 &&
              sCurr >= faceHalf - 0.36 &&
              sCurr <= faceHalf + 0.26;

            if (stayGrounded || fallingLand || stepUp) {
              const fcX = p.currentPos.x + _vCandNormal.x * faceHalf;
              const fcY = p.currentPos.y + _vCandNormal.y * faceHalf;
              const fcZ = p.currentPos.z + _vCandNormal.z * faceHalf;
              const surfY =
                fcY -
                ((this.playerPos.x - fcX) * _vCandNormal.x + (this.playerPos.z - fcZ) * _vCandNormal.z) /
                  _vCandNormal.y;
              if (surfY > bestTopY) {
                bestTopY = surfY;
                bestPlat = p;
                bestIsTilted = true;
                _vBestNormal.copy(_vCandNormal);
              }
            }
          }
        }
      }

      if (bestPlat) {
        this.playerPos.y = bestTopY;
        this.playerVel.y = 0;
        if (bestIsTilted && _vBestNormal.y < 0.80) {
          const slopeLen = Math.hypot(_vBestNormal.x, _vBestNormal.z);
          if (slopeLen > 1e-4) {
            const slideAccel = (0.80 - _vBestNormal.y) * 9.0;
            this.playerVel.x += (_vBestNormal.x / slopeLen) * slideAccel * subDt;
            this.playerVel.z += (_vBestNormal.z / slopeLen) * slideAccel * subDt;
          }
        }
        finalGrounded = true;
        finalStood = bestPlat;

        if (bestPlat.def.kind === 'disappearing' && bestPlat.state === 'solid') {
          bestPlat.state = 'warning';
          bestPlat.stateTimer = bestPlat.def.collapseDelay ?? 0.85;
          this.sound.playPlatformWarn();
        }
      } else {
        finalGrounded = false;
        finalStood = null;
      }

      // 4B. Underside head-bonk against nearby platforms & overhead walls when jumping upward
      if (!finalGrounded && this.playerVel.y > 0) {
        const headMargin = playerRadius * 0.65;
        const prevHeadY = prevFeetY + playerHeight;
        const currHeadY = this.playerPos.y + playerHeight;

        for (let i = 0; i < _nearPlatforms.length; i++) {
          const p = _nearPlatforms[i];
          if (p.state === 'gone') continue;
          const bdx = this.playerPos.x - p.currentPos.x;
          const bdz = this.playerPos.z - p.currentPos.z;
          const br = p.boundRadiusXZ + headMargin;
          if (bdx * bdx + bdz * bdz > br * br) continue;

          const [pw, ph, pd] = p.def.size;
          const botY = p.currentPos.y - ph * 0.5;
          if (!p.isRotated || p.def.rotationAxis === 'y') {
            if (prevHeadY <= botY + 0.28 && currHeadY >= botY) {
              let lx: number;
              let lz: number;
              if (!p.isRotated) {
                lx = this.playerPos.x - p.currentPos.x;
                lz = this.playerPos.z - p.currentPos.z;
              } else {
                _vLocal.set(this.playerPos.x - p.currentPos.x, 0, this.playerPos.z - p.currentPos.z).applyQuaternion(p.invQuat);
                lx = _vLocal.x;
                lz = _vLocal.z;
              }
              if (Math.abs(lx) < pw * 0.5 + headMargin && Math.abs(lz) < pd * 0.5 + headMargin) {
                this.playerPos.y = botY - playerHeight;
                this.playerVel.y = 0;
                break;
              }
            }
          }
        }

        for (let i = 0; i < _nearWalls.length; i++) {
          const w = _nearWalls[i];
          if (prevHeadY <= w.minY + 0.28 && this.playerPos.y + playerHeight >= w.minY) {
            if (
              this.playerPos.x > w.minX - headMargin &&
              this.playerPos.x < w.maxX + headMargin &&
              this.playerPos.z > w.minZ - headMargin &&
              this.playerPos.z < w.maxZ + headMargin
            ) {
              this.playerPos.y = w.minY - playerHeight;
              this.playerVel.y = 0;
              break;
            }
          }
        }
      }

      // 5. Horizontal side collision against elevated platform edges, inner walls & pool bounds
      this.resolveCircleSolids(
        this.playerPos,
        playerRadius,
        this.playerPos.y + 0.08,
        this.playerPos.y + playerHeight - 0.08,
        0.55,
        true,
        this.playerVel,
        this.playerPos.y + 0.34,
        finalStood && finalStood.isRotated && finalStood.def.rotationAxis !== 'y' ? finalStood : null,
        _nearPlatforms,
        _nearWalls
      );

      // 6. Pool floor clamp
      if (this.playerPos.y < this.currentLevel.bounds.floorY) {
        this.playerPos.y = this.currentLevel.bounds.floorY;
        this.playerVel.y = Math.max(0, this.playerVel.y);
      }
    }

    this.grounded = finalGrounded;
    this.stoodPlatform = finalStood;

    if (this.grounded) {
      this.waterJumpCooldown = 0;
    }

    if (this.grounded && !startGrounded && startY - this.playerPos.y > 0.12) {
      this.sound.playLand(false);
    }

    // 7. Water entry/exit state & audio
    this.wasInWater = this.inWater;
    this.inWater =
      !this.grounded &&
      this.playerPos.y < waterY - 0.06 &&
      (this.waterJumpTimer <= 0 || this.playerVel.y < 0);
    if (this.inWater && !this.wasInWater) {
      this.sound.playLand(true);
      this.spawnSplash(this.playerPos, 14, 1.3);
      this.camShake = Math.max(this.camShake, 0.25);
    }

    // 8. Footstep / Swim audio & Rig Animation
    const horizSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
    let animState: PlayerAnimState = 'idle';
    if (this.inWater) {
      animState = 'swim';
      if (horizSpeed > 0.6) {
        this.swimSplashTimer -= dt;
        if (this.swimSplashTimer <= 0) {
          this.swimSplashTimer = 0.42;
          this.sound.playSplash(0.2);
          this.spawnSplash(this.playerPos, 4, 0.6);
        }
      }
    } else if (!this.grounded) {
      animState = this.playerVel.y > 0.5 ? 'jump' : 'fall';
    } else if (horizSpeed > 0.45) {
      animState = wantsRun && horizSpeed > 6.2 ? 'run' : 'walk';
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) {
        this.stepTimer = animState === 'run' ? 0.28 : 0.42;
        this.sound.playStep(animState === 'run');
      }
    }

    this.mpLastAnimState = animState;
    this.mpLastHorizSpeed = horizSpeed;
    this.playerRig.root.scale.setScalar(1);
    this.playerRig.root.position.copy(this.playerPos);
    this.playerRig.root.rotation.set(0, this.playerYaw, 0);
    animatePlayerRig(this.playerRig, animState, horizSpeed, this.simTime, dt);
  }

  private updateRemotePlayers(dt: number): void {
    const k = 1 - Math.exp(-16 * dt);
    const nowMs = performance.now();
    const stepDt = Math.min(dt, 0.05);
    for (const rp of this.remotePlayers.values()) {
      if (rp.pushRecoveryTimer > 0) {
        rp.pushRecoveryTimer = Math.max(0, rp.pushRecoveryTimer - dt);
      }
      if (this.isUserBeingEaten(rp.userId)) {
        // Position & pose are driven directly by attachPreyToSerpentMouth
        continue;
      }
      if (!rp.alive || rp.escaped) continue;
      if (nowMs - rp.lastNetTimeMs <= 120) {
        rp.targetPos.x += rp.velX * stepDt;
        rp.targetPos.y += rp.velY * stepDt;
        rp.targetPos.z += rp.velZ * stepDt;
      }
      if (rp.pos.distanceToSquared(rp.targetPos) > 64) {
        rp.pos.copy(rp.targetPos);
      } else {
        rp.pos.lerp(rp.targetPos, k);
      }
      rp.yaw += shortestAngleDiff(rp.yaw, rp.targetYaw) * k;
      rp.rig.root.scale.setScalar(1);
      rp.rig.root.position.copy(rp.pos);
      rp.rig.root.rotation.set(0, rp.yaw, 0);
      rp.nameplate.visible = true;
      animatePlayerRig(rp.rig, rp.animState, rp.horizSpeed, this.simTime, dt);
    }
    this.canPushTargetCache =
      this.isMultiplayer &&
      this.phase === 'playing' &&
      this.mpLocalAlive &&
      !this.mpLocalBeingEaten &&
      !this.mpLocalEscaped &&
      this.findLocalPushCandidate() !== null;
  }

  private stepMonsterEating(m: RuntimeMonster, dt: number, playAudio: boolean): void {
    const waterY = this.currentLevel.bounds.waterY;
    m.eatingTimer += dt;
    const localProgress = THREE.MathUtils.clamp(m.eatingTimer / EAT_DURATION_SEC, 0, 1);
    const eatU = Math.max(m.eatingProgress, localProgress);
    m.eatingProgress = eatU;

    if (playAudio) {
      const distToViewer = Math.hypot(this.playerPos.x - m.pos.x, this.playerPos.z - m.pos.z);
      const isLocalVictim = m.eatingUserId === '__local__' || m.eatingUserId === this.mpLocalUserId;
      const vol = isLocalVictim ? 1.0 : Math.max(0.18, 1 - distToViewer / 28) * 0.85;
      if (eatU >= 0.42 && m.eatingGulpStage < 1) {
        m.eatingGulpStage = 1;
        this.sound.playSwallowGulp(1, vol);
        if (isLocalVictim) this.camShake = Math.max(this.camShake, 0.22);
      } else if (eatU >= 0.68 && m.eatingGulpStage < 2) {
        m.eatingGulpStage = 2;
        this.sound.playSwallowGulp(2, vol);
        if (isLocalVictim) this.camShake = Math.max(this.camShake, 0.18);
      }
    }

    if (eatU < 0.62) {
      m.wakeSplashTimer -= dt;
      if (m.wakeSplashTimer <= 0) {
        m.wakeSplashTimer = 0.06;
        this.spawnSplash(m.pos, 7, 1.4);
      }
    }

    m.pos.y = waterY - 0.14;
    m.rig.root.position.copy(m.pos);
    m.rig.root.rotation.y = 0;

    animateMonsterRig(
      m.rig,
      'chasing',
      m.eatingPreyStartPos,
      m.pos,
      m.yaw,
      waterY,
      this.simTime,
      dt,
      1,
      eatU
    );

    const monsterBotY = waterY - 1.5;
    const monsterTopY = waterY + 4.2 * m.scale;
    this.populateNearbyObstacles(m.pos.x, m.pos.z, m.scale * 24 + 6);
    for (let sIdx = 1; sIdx < m.rig.segments.length; sIdx++) {
      const seg = m.rig.segments[sIdx];
      const segR = Math.max(0.24, seg.radius * 0.85);
      const origX = m.pos.x + seg.group.position.x;
      const origZ = m.pos.z + seg.group.position.z;
      _vSegWorld.set(origX, m.pos.y + seg.group.position.y, origZ);
      this.resolveCircleSolids(
        _vSegWorld,
        segR,
        monsterBotY,
        monsterTopY,
        segR + 0.1,
        true,
        undefined,
        -Infinity,
        null,
        _nearPlatforms,
        _nearWalls
      );
      const pushDx = _vSegWorld.x - origX;
      const pushDz = _vSegWorld.z - origZ;
      if (pushDx * pushDx + pushDz * pushDz > 1e-6) {
        seg.group.position.x = _vSegWorld.x - m.pos.x;
        seg.group.position.z = _vSegWorld.z - m.pos.z;
        seg.worldPos.x += pushDx * 0.35;
        seg.worldPos.z += pushDz * 0.35;
      }
    }
    syncSerpentBones(m.rig, m.yaw);

    // Attach victim rig cleanly inside serpent's jaws until swallowing completes
    if (m.eatingUserId === '__local__' || m.eatingUserId === this.mpLocalUserId) {
      if (eatU < 0.995) {
        this.playerRig.setVisible(true);
        attachPreyToSerpentMouth(
          m.rig,
          this.playerRig,
          eatU,
          this.simTime,
          dt,
          m.eatingPreyStartPos,
          m.eatingPreyStartYaw
        );
      }
    } else if (m.eatingUserId) {
      const rp = this.remotePlayers.get(m.eatingUserId);
      if (rp) {
        if (eatU < 0.995) {
          rp.rig.root.visible = true;
          rp.nameplate.visible = eatU < 0.52;
          attachPreyToSerpentMouth(
            m.rig,
            rp.rig,
            eatU,
            this.simTime,
            dt,
            m.eatingPreyStartPos,
            m.eatingPreyStartYaw
          );
        } else {
          rp.rig.root.visible = false;
        }
      }
    }
  }

  private updateMultiplayerMonsters(dt: number, skipMonster: RuntimeMonster | null = null): void {
    const waterY = this.currentLevel.bounds.waterY;
    const b = this.currentLevel.bounds;
    let closestDist = 999;
    let highestAlert: 'calm' | 'searching' | 'chasing' = 'calm';
    const k = 1 - Math.exp(-22 * dt);
    const yawK = Math.min(1, 18 * dt);
    const lodCut = this.activeQuality === 'smooth' ? 88 : this.activeQuality === 'standard' ? 130 : 190;
    const stepLead = Math.min(dt, 0.045);

    for (let i = 0; i < this.monsters.length; i++) {
      const m = this.monsters[i];
      if (m === skipMonster) continue;

      const d = Math.hypot(this.playerPos.x - m.pos.x, this.playerPos.z - m.pos.z);
      if (d < closestDist) closestDist = d;

      if (m.eatingUserId) {
        highestAlert = 'chasing';
        m.rig.root.visible = true;
        this.stepMonsterEating(m, dt, true);
        continue;
      }

      if (Math.hypot(m.velX, m.velZ) > 0.25) {
        m.searchTarget.x = THREE.MathUtils.clamp(m.searchTarget.x + m.velX * stepLead, b.minX + 0.9, b.maxX - 0.9);
        m.searchTarget.z = THREE.MathUtils.clamp(m.searchTarget.z + m.velZ * stepLead, b.minZ + 0.9, b.maxZ - 0.9);
      }

      m.pos.lerp(m.searchTarget, k);
      m.yaw += shortestAngleDiff(m.yaw, m.targetYaw) * yawK;
      if (m.alert === 'chasing') highestAlert = 'chasing';

      const camDist = Math.hypot(this.camera.position.x - m.pos.x, this.camera.position.z - m.pos.z);
      if (camDist > lodCut && m.alert !== 'chasing') {
        m.rig.root.visible = camDist <= lodCut * 1.18;
        if ((this.renderFrameIdx + i) % 3 !== 0) {
          continue;
        }
        m.rig.root.position.copy(m.pos);
        m.rig.root.rotation.y = 0;
        const calmBreach = Math.max(0, Math.sin(this.simTime * 0.55 + m.pos.z * 0.05) - 0.6) * 0.55;
        const lookForward = _vLookAhead.set(m.pos.x + Math.sin(m.yaw) * 8, m.pos.y, m.pos.z + Math.cos(m.yaw) * 8);
        animateMonsterRig(m.rig, m.alert, lookForward, m.pos, m.yaw, waterY, this.simTime, dt * 3, calmBreach);
        syncSerpentBones(m.rig, m.yaw);
        continue;
      }
      m.rig.root.visible = true;

      if (m.alert === 'chasing') {
        m.wakeSplashTimer -= dt;
        if (m.wakeSplashTimer <= 0) {
          m.wakeSplashTimer = 0.055;
          this.spawnSplash(m.pos, 8, 1.45);
        }
      }

      const lookForward = _vLookAhead.set(
        m.pos.x + Math.sin(m.yaw) * 8,
        m.pos.y,
        m.pos.z + Math.cos(m.yaw) * 8
      );
      let targetPlayerPos: THREE.Vector3 = lookForward;
      if (m.alert === 'chasing' && m.targetUserId) {
        if (m.targetUserId === this.mpLocalUserId) {
          targetPlayerPos = this.playerPos;
        } else {
          targetPlayerPos = this.remotePlayers.get(m.targetUserId)?.pos || lookForward;
        }
      }

      const calmBreach = Math.max(0, Math.sin(this.simTime * 0.55 + m.pos.z * 0.05) - 0.6) * 0.55;
      const emergeFactor = m.alert === 'chasing' ? (m.emerged ? 1 : 0) : calmBreach;
      m.rig.root.position.copy(m.pos);
      m.rig.root.rotation.y = 0;
      animateMonsterRig(m.rig, m.alert, targetPlayerPos, m.pos, m.yaw, waterY, this.simTime, dt, emergeFactor);

      // Keep trailing spine segments out of platforms, walls, and bounds on client
      const monsterBotY = waterY - 1.5;
      const monsterTopY = waterY + 4.2 * m.scale;
      this.populateNearbyObstacles(m.pos.x, m.pos.z, m.scale * 24 + 6);
      for (let sIdx = 1; sIdx < m.rig.segments.length; sIdx++) {
        const seg = m.rig.segments[sIdx];
        const segR = Math.max(0.24, seg.radius * 0.85);
        const origX = m.pos.x + seg.group.position.x;
        const origZ = m.pos.z + seg.group.position.z;
        _vSegWorld.set(origX, m.pos.y + seg.group.position.y, origZ);
        this.resolveCircleSolids(
          _vSegWorld,
          segR,
          monsterBotY,
          monsterTopY,
          segR + 0.1,
          true,
          undefined,
          -Infinity,
          null,
          _nearPlatforms,
          _nearWalls
        );
        const pushDx = _vSegWorld.x - origX;
        const pushDz = _vSegWorld.z - origZ;
        if (pushDx * pushDx + pushDz * pushDz > 1e-6) {
          seg.group.position.x = _vSegWorld.x - m.pos.x;
          seg.group.position.z = _vSegWorld.z - m.pos.z;
          seg.worldPos.x += pushDx * 0.35;
          seg.worldPos.z += pushDz * 0.35;
        }
      }
      syncSerpentBones(m.rig, m.yaw);
    }

    const underwater = this.camera.position.y < waterY;
    this.sound.updateAtmosphere(this.simTime, closestDist, highestAlert, this.inWater, underwater, true);
  }

  private updateCheckpoints(dt: number): void {
    if (this.checkpointNoticeTimer > 0) {
      this.checkpointNoticeTimer -= dt;
      if (this.checkpointNoticeTimer <= 0) {
        this.checkpointNotice = null;
      }
    }

    for (let i = 0; i < this.checkpoints.length; i++) {
      const cp = this.checkpoints[i];
      if (!cp.activated) {
        const dist = Math.hypot(
          this.playerPos.x - cp.group.position.x,
          this.playerPos.z - cp.group.position.z
        );
        const yDiff = Math.abs(this.playerPos.y - cp.group.position.y);
        if (dist < 2.2 && yDiff < 2.5) {
          cp.activated = true;
          cp.beaconMat.color.setHex(0x4ef2b8);
          cp.beaconMat.emissive.setHex(0x28d196);
          cp.lightColor.setHex(0x4ef2b8);
          this.activeSpawn.set(cp.group.position.x, cp.group.position.y + 0.5, cp.group.position.z);
          this.activeCheckpointIndex = i + 1;
          this.checkpointNotice = `CHECKPOINT ${i + 1} REACHED`;
          this.checkpointNoticeTimer = 2.6;
          this.sound.playCheckpoint();
          this.emitHud(true);
        }
      }
    }
  }

  private updateMonsters(dt: number, canAttack: boolean): void {
    const waterY = this.currentLevel.bounds.waterY;
    // Strict Water-Only Detection: serpent ONLY chases/attacks when player's body is actually inside water
    const playerInWater = canAttack && this.inWater;

    let closestDist = 999;
    let closestMonsterIdx = -1;
    let highestAlert: 'calm' | 'searching' | 'chasing' = 'calm';

    for (let i = 0; i < this.monsters.length; i++) {
      const m = this.monsters[i];
      const d = Math.hypot(this.playerPos.x - m.pos.x, this.playerPos.z - m.pos.z);
      if (d < closestDist) {
        closestDist = d;
        closestMonsterIdx = i;
      }
    }

    for (let i = 0; i < this.monsters.length; i++) {
      const m = this.monsters[i];
      const distToPlayer = Math.hypot(this.playerPos.x - m.pos.x, this.playerPos.z - m.pos.z);

      // Immediate exact-position detection when player falls into water
      const shouldChase =
        playerInWater && (distToPlayer <= m.waterDetectionRadius || i === closestMonsterIdx);

      // Extreme pursuit velocity (dramatically faster than player's 3.8 m/s swim)
      const extremeChaseSpeed = Math.max(48.0, m.chaseSpeed * 7.2);

      const monsterRadius = 0.88 * m.scale;
      const monsterBotY = waterY - 1.5;
      const monsterTopY = waterY + 4.2 * m.scale;
      const nearRadius = m.scale * 24 + 8;
      this.populateNearbyObstacles(m.pos.x, m.pos.z, nearRadius);

      const checkMonsterBlocked = (cx: number, cz: number, cr: number): boolean => {
        if (Math.hypot(cx - m.pos.x, cz - m.pos.z) + cr <= nearRadius - 1) {
          return this.isCircleBlocked(cx, cz, cr, monsterBotY, monsterTopY, _nearPlatforms, _nearWalls);
        }
        return this.isCircleBlocked(cx, cz, cr, monsterBotY, monsterTopY, this.platforms, this.walls);
      };

      const nav = _monsterNavScratch;
      nav.x = m.pos.x;
      nav.z = m.pos.z;
      nav.yaw = m.yaw;
      nav.velX = m.velX;
      nav.velZ = m.velZ;
      nav.wpIndex = m.wpIndex;
      nav.waypoints = m.waypoints;
      nav.avoidDir = m.avoidDir;
      nav.avoidTimer = m.avoidTimer;
      nav.stuckTimer = m.stuckTimer;
      nav.navBestDist = m.navBestDist;
      nav.navStallTimer = m.navStallTimer;
      nav.navAnchorX = m.navAnchorX;
      nav.navAnchorZ = m.navAnchorZ;
      nav.navAnchorTimer = m.navAnchorTimer;
      nav.navTurnAccum = m.navTurnAccum;

      if (shouldChase) {
        if (m.alert !== 'chasing') {
          m.alert = 'chasing';
          m.emerged = distToPlayer < 10.5;
          // Instant velocity & orientation launch toward player's exact coordinates (zero hesitation)
          const dxLaunch = this.playerPos.x - m.pos.x;
          const dzLaunch = this.playerPos.z - m.pos.z;
          const lenLaunch = Math.hypot(dxLaunch, dzLaunch);
          if (lenLaunch > 0.01) {
            const nx = dxLaunch / lenLaunch;
            const nz = dzLaunch / lenLaunch;
            nav.yaw = Math.atan2(nx, nz);
            nav.velX = nx * extremeChaseSpeed;
            nav.velZ = nz * extremeChaseSpeed;
          }
          resetSerpentNavProgress(nav);
          this.sound.playSerpentEmerge(0.72);
          this.spawnSplash(m.pos, 32, 2.2);
          this.camShake = Math.max(this.camShake, 0.25);
        }
        m.searchTarget.copy(this.playerPos);
      } else {
        if (m.alert !== 'calm') {
          m.alert = 'calm';
          m.searchTimer = 0;
          m.emerged = false;
          // Immediately cancel hyper-speed strike momentum and resume calm patrol
          const spd = Math.hypot(nav.velX, nav.velZ);
          if (spd > m.patrolSpeed && spd > 0.01) {
            const damp = m.patrolSpeed / spd;
            nav.velX *= damp;
            nav.velZ *= damp;
          }
          nav.avoidTimer = 0;
          selectClosestPatrolWaypoint(nav, monsterRadius, checkMonsterBlocked);
        }
      }

      if (m.alert === 'chasing') highestAlert = 'chasing';

      let tx = m.pos.x;
      let tz = m.pos.z;
      let moveSpeed = m.patrolSpeed;
      let hasMoveTarget = false;

      if (m.alert === 'chasing') {
        tx = this.playerPos.x;
        tz = this.playerPos.z;
        moveSpeed = extremeChaseSpeed;
        hasMoveTarget = Math.hypot(tx - nav.x, tz - nav.z) > 0.05;
      } else {
        const patrolTarget = resolvePatrolTarget(nav, monsterRadius, checkMonsterBlocked);
        tx = patrolTarget.tx;
        tz = patrolTarget.tz;
        hasMoveTarget = patrolTarget.hasTarget;
      }

      const isChasing = m.alert === 'chasing';
      const subSteps = isChasing ? 6 : 1;
      const subDt = dt / subSteps;
      const catchDist = 2.05 * m.scale;
      let caughtDuringSubstep = false;

      for (let step = 0; step < subSteps; step++) {
        const prevX = nav.x;
        const prevZ = nav.z;
        const prevYaw = nav.yaw;
        const steer = hasMoveTarget
          ? computeSerpentSteerAngle(nav, tx, tz, monsterRadius, isChasing, checkMonsterBlocked)
          : { valid: false, steerAngle: nav.yaw };

        if (steer.valid && moveSpeed > 0.05) {
          const desiredVx = Math.sin(steer.steerAngle) * moveSpeed;
          const desiredVz = Math.cos(steer.steerAngle) * moveSpeed;
          const steerBlend = Math.min(1, (isChasing ? 65.0 : 8.5) * subDt);
          nav.velX += (desiredVx - nav.velX) * steerBlend;
          nav.velZ += (desiredVz - nav.velZ) * steerBlend;

          nav.x += nav.velX * subDt;
          nav.z += nav.velZ * subDt;

          // Hard 3D solid collision resolution against nearby active platforms, walls, and bounds
          m.pos.x = nav.x;
          m.pos.z = nav.z;
          _vMonsterVel.set(nav.velX, 0, nav.velZ);
          this.resolveCircleSolids(
            m.pos,
            monsterRadius,
            monsterBotY,
            monsterTopY,
            monsterRadius + 0.15,
            true,
            _vMonsterVel,
            -Infinity,
            null,
            _nearPlatforms,
            _nearWalls
          );
          nav.x = m.pos.x;
          nav.z = m.pos.z;
          nav.velX = _vMonsterVel.x;
          nav.velZ = _vMonsterVel.z;

          if (this.isCircleBlocked(nav.x, nav.z, monsterRadius - 0.02, monsterBotY, monsterTopY, _nearPlatforms, _nearWalls)) {
            let escaped = false;
            const escRadii = [0.25, 0.5, 0.85, 1.25];
            for (let rIdx = 0; rIdx < escRadii.length && !escaped; rIdx++) {
              const stepR = escRadii[rIdx];
              for (let k = 0; k < 8; k++) {
                const ang = (k * Math.PI) / 4;
                const txEsc = nav.x + Math.sin(ang) * stepR;
                const tzEsc = nav.z + Math.cos(ang) * stepR;
                if (!this.isCircleBlocked(txEsc, tzEsc, monsterRadius, monsterBotY, monsterTopY, _nearPlatforms, _nearWalls)) {
                  nav.x = txEsc;
                  nav.z = tzEsc;
                  escaped = true;
                  break;
                }
              }
            }
          }
        }

        updateSerpentProgressAndYaw(
          nav,
          prevX,
          prevZ,
          prevYaw,
          moveSpeed,
          subDt,
          isChasing,
          steer.valid,
          checkMonsterBlocked,
          45.0
        );

        m.pos.x = nav.x;
        m.pos.z = nav.z;

        if (canAttack && playerInWater && isChasing) {
          const dSub = Math.hypot(this.playerPos.x - nav.x, this.playerPos.z - nav.z);
          if (dSub < catchDist) {
            caughtDuringSubstep = true;
            break;
          }
        }
      }

      m.pos.x = nav.x;
      m.pos.z = nav.z;
      m.yaw = nav.yaw;
      m.velX = nav.velX;
      m.velZ = nav.velZ;
      m.wpIndex = nav.wpIndex;
      m.avoidDir = nav.avoidDir;
      m.avoidTimer = nav.avoidTimer;
      m.stuckTimer = nav.stuckTimer;
      m.navBestDist = nav.navBestDist;
      m.navStallTimer = nav.navStallTimer;
      m.navAnchorX = nav.navAnchorX;
      m.navAnchorZ = nav.navAnchorZ;
      m.navAnchorTimer = nav.navAnchorTimer;
      m.navTurnAccum = nav.navTurnAccum;

      if (caughtDuringSubstep) {
        this.spawnSplash(this.playerPos, 40, 2.8);
        this.triggerDeath('caught', m);
        return;
      }
    }

    // Monster-vs-monster separation BEFORE spine animation so heads & spines stay cleanly aligned
    for (let i = 0; i < this.monsters.length; i++) {
      for (let j = i + 1; j < this.monsters.length; j++) {
        const a = this.monsters[i];
        const b = this.monsters[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const dist = Math.hypot(dx, dz);
        const minSep = (a.scale + b.scale) * 0.92;
        if (dist < minSep && dist > 1e-4) {
          const push = (minSep - dist) * 0.5;
          const nx = dx / dist;
          const nz = dz / dist;
          a.pos.x -= nx * push;
          a.pos.z -= nz * push;
          b.pos.x += nx * push;
          b.pos.z += nz * push;
          const ar = 0.9 * a.scale;
          const br = 0.9 * b.scale;
          this.resolveCircleSolids(a.pos, ar, waterY - 1.5, waterY + 4.2 * a.scale, ar + 0.15, true);
          this.resolveCircleSolids(b.pos, br, waterY - 1.5, waterY + 4.2 * b.scale, br + 0.15, true);
        }
      }
    }

    // Visual animation, surface emergence, wake splashes, and continuous spine collision (LOD culled at distance)
    const lodCut = this.activeQuality === 'smooth' ? 88 : this.activeQuality === 'standard' ? 130 : 190;
    for (let i = 0; i < this.monsters.length; i++) {
      const m = this.monsters[i];
      const monsterBotY = waterY - 1.5;
      const monsterTopY = waterY + 4.2 * m.scale;

      // Underwater approach -> sudden violent surface emergence near player (plus eerie calm dorsal crest)
      const postDist = Math.hypot(this.playerPos.x - m.pos.x, this.playerPos.z - m.pos.z);
      const targetEmerge = m.alert === 'chasing' && postDist < 10.5 ? 1 : 0;
      const calmCrest =
        m.alert === 'calm'
          ? Math.max(0, Math.sin(this.simTime * 0.5 + i * 1.9) - 0.58) * 0.55
          : 0;
      if (m.alert === 'chasing' && targetEmerge > 0.5 && !m.emerged) {
        m.emerged = true;
        this.sound.playSerpentEmerge(0.7);
        this.spawnSplash(m.pos, 32, 2.4);
        this.camShake = Math.max(this.camShake, 0.38);
      } else if (targetEmerge === 0) {
        m.emerged = false;
      }

      const camDist = Math.hypot(this.camera.position.x - m.pos.x, this.camera.position.z - m.pos.z);
      if (camDist > lodCut && m.alert !== 'chasing') {
        m.rig.root.visible = camDist <= lodCut * 1.18;
        if ((this.renderFrameIdx + i) % 3 !== 0) {
          continue;
        }
        m.pos.y = waterY - 0.14;
        m.rig.root.position.copy(m.pos);
        m.rig.root.rotation.y = 0;
        const lookTarget = _vLookAhead.set(m.pos.x + Math.sin(m.yaw) * 8, m.pos.y, m.pos.z + Math.cos(m.yaw) * 8);
        animateMonsterRig(m.rig, m.alert, lookTarget, m.pos, m.yaw, waterY, this.simTime, dt * 3, calmCrest);
        syncSerpentBones(m.rig, m.yaw);
        continue;
      }
      m.rig.root.visible = true;

      // Intense churning water splashes & tail spray when surging at extreme speed
      if (m.alert === 'chasing') {
        m.wakeSplashTimer -= dt;
        if (m.wakeSplashTimer <= 0) {
          m.wakeSplashTimer = 0.018;
          this.spawnSplash(m.pos, 7, 1.85);
          if (m.rig.segments.length > 5) {
            this.spawnSplash(m.rig.segments[4].worldPos, 5, 1.5);
          }
          if (m.rig.segments.length > 18) {
            this.spawnSplash(m.rig.segments[18].worldPos, 5, 1.75);
          }
        }
      }

      // Serpent head base stays locked at water surface level
      m.pos.y = waterY - 0.14;
      m.rig.root.position.copy(m.pos);
      m.rig.root.rotation.y = 0;

      const lookTarget =
        canAttack && playerInWater
          ? this.playerPos
          : _vLookAhead.set(m.pos.x + Math.sin(m.yaw) * 8, m.pos.y, m.pos.z + Math.cos(m.yaw) * 8);

      animateMonsterRig(
        m.rig,
        m.alert,
        lookTarget,
        m.pos,
        m.yaw,
        waterY,
        this.simTime,
        dt,
        m.alert === 'chasing' ? targetEmerge : calmCrest
      );

      // Keep trailing spine segments (sIdx >= 1) out of platforms, walls, and bounds without corrupting seg.worldPos with S-wave offsets
      this.populateNearbyObstacles(m.pos.x, m.pos.z, m.scale * 24 + 6);
      for (let sIdx = 1; sIdx < m.rig.segments.length; sIdx++) {
        const seg = m.rig.segments[sIdx];
        const segR = Math.max(0.24, seg.radius * 0.85);
        const origX = m.pos.x + seg.group.position.x;
        const origZ = m.pos.z + seg.group.position.z;
        _vSegWorld.set(origX, m.pos.y + seg.group.position.y, origZ);
        this.resolveCircleSolids(
          _vSegWorld,
          segR,
          monsterBotY,
          monsterTopY,
          segR + 0.1,
          true,
          undefined,
          -Infinity,
          null,
          _nearPlatforms,
          _nearWalls
        );
        const pushDx = _vSegWorld.x - origX;
        const pushDz = _vSegWorld.z - origZ;
        if (pushDx * pushDx + pushDz * pushDz > 1e-6) {
          seg.group.position.x = _vSegWorld.x - m.pos.x;
          seg.group.position.z = _vSegWorld.z - m.pos.z;
          seg.worldPos.x += pushDx * 0.35;
          seg.worldPos.z += pushDz * 0.35;
        }
      }
      syncSerpentBones(m.rig, m.yaw);
    }

    // Catch & Jumpscare check: ONLY possible while player's body is in water and serpent is chasing
    if (canAttack && playerInWater) {
      for (const m of this.monsters) {
        if (m.alert !== 'chasing') continue;
        const distToPlayer = Math.hypot(this.playerPos.x - m.pos.x, this.playerPos.z - m.pos.z);
        const catchDist = 2.05 * m.scale;
        if (distToPlayer < catchDist) {
          this.spawnSplash(this.playerPos, 40, 2.8);
          this.triggerDeath('caught', m);
          return;
        }
      }
    }

    if (canAttack) {
      const underwater = this.camera.position.y < waterY;
      this.sound.updateAtmosphere(this.simTime, closestDist, highestAlert, playerInWater, underwater, true);
    }
  }

  private updatePlayCamera(dt: number): void {
    // Target local player or spectate first alive teammate if caught in multiplayer
    let focusPos = this.playerPos;
    if (this.isMultiplayer && (!this.mpLocalAlive || this.mpLocalEscaped)) {
      for (const rp of this.remotePlayers.values()) {
        if (rp.alive && !rp.escaped) {
          focusPos = rp.pos;
          break;
        }
      }
    }
    _vCamTarget.set(focusPos.x, focusPos.y + 1.48, focusPos.z);

    const dist = this.inWater ? 4.4 : 5.0;
    const horizDist = Math.cos(this.camPitch) * dist;
    const vertDist = Math.sin(this.camPitch) * dist;

    _vCamPos.set(
      _vCamTarget.x + Math.sin(this.camYaw) * horizDist,
      _vCamTarget.y + vertDist,
      _vCamTarget.z + Math.cos(this.camYaw) * horizDist
    );

    // Exact ray-AABB slab occlusion check using spatial grid candidate walls
    const bestCamT = this.computeCameraWallOcclusion(
      _vCamTarget.x,
      _vCamTarget.y,
      _vCamTarget.z,
      _vCamPos.x,
      _vCamPos.y,
      _vCamPos.z,
      0.35
    );
    if (bestCamT < 1.0) {
      const safeT = Math.max(0.22, bestCamT * 0.96);
      _vCamPos.set(
        _vCamTarget.x + (_vCamPos.x - _vCamTarget.x) * safeT,
        _vCamTarget.y + (_vCamPos.y - _vCamTarget.y) * safeT,
        _vCamTarget.z + (_vCamPos.z - _vCamTarget.z) * safeT
      );
    }

    // Clamp camera safely inside level bounds and above pool floor
    const b = this.currentLevel.bounds;
    _vCamPos.x = THREE.MathUtils.clamp(_vCamPos.x, b.minX + 0.35, b.maxX - 0.35);
    _vCamPos.z = THREE.MathUtils.clamp(_vCamPos.z, b.minZ + 0.35, b.maxZ - 0.35);
    _vCamPos.y = THREE.MathUtils.clamp(_vCamPos.y, b.floorY + 0.4, b.ceilingY - 0.4);

    // Smooth exponential damping
    const k = 1 - Math.exp(-16 * dt);
    this.camera.position.lerp(_vCamPos, k);

    // Decaying camera shake from splash/monster proximity
    if (this.camShake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.camShake;
      this.camera.position.y += (Math.random() - 0.5) * this.camShake;
      this.camShake = Math.max(0, this.camShake - dt * 1.4);
    }

    this.camera.lookAt(_vCamTarget);
  }

  private checkExit(): void {
    const ex = this.currentLevel.exit;
    const dx = Math.abs(this.playerPos.x - ex.position[0]);
    const dy = Math.abs(this.playerPos.y - ex.position[1]);
    const dz = Math.abs(this.playerPos.z - ex.position[2]);
    if (dx < ex.size[0] * 0.65 && dz < Math.max(1.5, ex.size[2]) && dy < 2.5) {
      if (this.isMultiplayer) {
        if (!this.mpLocalEscaped) {
          this.mpLocalEscaped = true;
          this.playerRig.setVisible(false);
          this.sound.playVictory();
          this.callbacks.onMultiplayerTick?.({
            x: this.playerPos.x,
            y: this.playerPos.y,
            z: this.playerPos.z,
            yaw: this.playerYaw,
            animState: this.mpLastAnimState,
            horizSpeed: this.mpLastHorizSpeed,
            inWater: this.inWater,
            checkpointIndex: this.activeCheckpointIndex,
            escaped: true,
          });
          this.callbacks.onMultiplayerEscaped?.();
        }
        return;
      }
      this.setPhase('victory');
      this.sound.playVictory();
      this.sound.updateAtmosphere(this.simTime, 50, 'calm', false, false, false);
      this.callbacks.onPhaseChange('victory', { elapsed: this.levelTimeElapsed });
    }
  }

  private computeCameraWallOcclusion(
    targetX: number,
    targetY: number,
    targetZ: number,
    camX: number,
    camY: number,
    camZ: number,
    wallPad = 0.25
  ): number {
    const rayDx = camX - targetX;
    const rayDy = camY - targetY;
    const rayDz = camZ - targetZ;
    let bestCamT = 1.0;

    let wallCount = this.walls.length;
    const useGrid = Boolean(this.spatialGrid);
    if (this.spatialGrid) {
      this.spatialGrid.queryBox(
        Math.min(targetX, camX) - wallPad - 0.5,
        Math.max(targetX, camX) + wallPad + 0.5,
        Math.min(targetZ, camZ) - wallPad - 0.5,
        Math.max(targetZ, camZ) + wallPad + 0.5,
        null,
        _camWallIdx
      );
      wallCount = _camWallIdx.length;
    }

    for (let i = 0; i < wallCount; i++) {
      const w = useGrid ? this.walls[_camWallIdx[i]] : this.walls[i];
      if (!w) continue;
      let tmin = 0;
      let tmax = bestCamT;

      if (Math.abs(rayDx) < 1e-6) {
        if (targetX < w.minX - wallPad || targetX > w.maxX + wallPad) continue;
      } else {
        const inv = 1 / rayDx;
        let t1 = (w.minX - wallPad - targetX) * inv;
        let t2 = (w.maxX + wallPad - targetX) * inv;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }

      if (Math.abs(rayDy) < 1e-6) {
        if (targetY < w.minY - wallPad || targetY > w.maxY + wallPad) continue;
      } else {
        const inv = 1 / rayDy;
        let t1 = (w.minY - wallPad - targetY) * inv;
        let t2 = (w.maxY + wallPad - targetY) * inv;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }

      if (Math.abs(rayDz) < 1e-6) {
        if (targetZ < w.minZ - wallPad || targetZ > w.maxZ + wallPad) continue;
      } else {
        const inv = 1 / rayDz;
        let t1 = (w.minZ - wallPad - targetZ) * inv;
        let t2 = (w.maxZ + wallPad - targetZ) * inv;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }

      if (tmin > 0 && tmin < bestCamT) {
        bestCamT = tmin;
      }
    }
    return bestCamT;
  }

  private animateSecondaryMonstersDuringEat(dt: number): void {
    const waterY = this.currentLevel.bounds.waterY;
    for (let i = 0; i < this.monsters.length; i++) {
      const m = this.monsters[i];
      if (m === this.jumpscareMonster) continue;
      const calmCrest = Math.max(0, Math.sin(this.simTime * 0.5 + i * 1.9) - 0.58) * 0.55;
      m.pos.y = waterY - 0.14;
      m.rig.root.position.copy(m.pos);
      m.rig.root.rotation.y = 0;
      const lookAhead = _vLookAhead.set(
        m.pos.x + Math.sin(m.yaw) * 8,
        m.pos.y,
        m.pos.z + Math.cos(m.yaw) * 8
      );
      animateMonsterRig(m.rig, 'calm', lookAhead, m.pos, m.yaw, waterY, this.simTime, dt, calmCrest);
    }
  }

  private updateEatingCamera(m: RuntimeMonster, eatU: number, dt: number): void {
    const waterY = this.currentLevel.bounds.waterY;
    const b = this.currentLevel.bounds;
    m.rig.root.updateMatrixWorld(true);
    m.rig.headGroup.getWorldPosition(_vEatHeadPos);

    // Frame slightly ahead of head center so both the jaws and swallowed diver stay centered cleanly
    const forwardBias = (0.42 - eatU * 0.15) * m.scale;
    const headWorld = _vCamTarget.set(
      _vEatHeadPos.x + Math.sin(m.yaw) * forwardBias,
      _vEatHeadPos.y - 0.08 * m.scale,
      _vEatHeadPos.z + Math.cos(m.yaw) * forwardBias
    );

    // 3/4 side-front cinematic framing sweeping closer as jaws clamp & swallow
    const orbitAngle = m.yaw + this.eatingCamSide * THREE.MathUtils.lerp(0.95, 0.68, THREE.MathUtils.smoothstep(eatU, 0.15, 0.85));
    const camDist = THREE.MathUtils.lerp(5.25, 4.3, THREE.MathUtils.smoothstep(eatU, 0.08, 0.82)) * m.scale;
    const camY = waterY + THREE.MathUtils.lerp(2.2, 2.7, THREE.MathUtils.smoothstep(eatU, 0.14, 0.72)) * m.scale;

    const camSpot = _vCamPos.set(
      headWorld.x + Math.sin(orbitAngle) * camDist,
      camY,
      headWorld.z + Math.cos(orbitAngle) * camDist
    );

    camSpot.x = THREE.MathUtils.clamp(camSpot.x, b.minX + 0.45, b.maxX - 0.45);
    camSpot.z = THREE.MathUtils.clamp(camSpot.z, b.minZ + 0.45, b.maxZ - 0.45);
    camSpot.y = THREE.MathUtils.clamp(
      camSpot.y,
      Math.max(b.floorY + 0.45, waterY + 0.48),
      b.ceilingY - 0.45
    );

    const bestCamT = this.computeCameraWallOcclusion(
      headWorld.x,
      headWorld.y,
      headWorld.z,
      camSpot.x,
      camSpot.y,
      camSpot.z,
      0.28
    );
    if (bestCamT < 1.0) {
      const safeT = Math.max(0.42, bestCamT * 0.94);
      camSpot.set(
        headWorld.x + (camSpot.x - headWorld.x) * safeT,
        headWorld.y + (camSpot.y - headWorld.y) * safeT,
        headWorld.z + (camSpot.z - headWorld.z) * safeT
      );
    }

    const blendK = dt > 0 ? 1 - Math.exp(-9.5 * dt) : 0.35;
    this.camera.position.lerp(camSpot, blendK);

    if (this.camShake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.camShake;
      this.camera.position.y += (Math.random() - 0.5) * this.camShake;
      this.camShake = Math.max(0, this.camShake - dt * 1.5);
    }

    this.camera.lookAt(headWorld);
  }

  private triggerDeath(reason: 'caught' | 'timeout', monster: RuntimeMonster | null): void {
    if (this.phase !== 'playing') return;
    this.deathReason = reason;
    this.jumpscareMonster = monster;
    this.phase = 'jumpscare';

    if (reason === 'caught' && monster) {
      this.jumpscareTimer = EAT_DURATION_SEC;
      this.playerRig.root.scale.setScalar(1);
      this.playerRig.setVisible(true);
      this.beginMonsterEatingSequence(
        monster,
        '__local__',
        this.playerPos.x,
        this.playerPos.y,
        this.playerPos.z,
        this.playerYaw,
        0
      );
      this.eatingCamSide = this.chooseEatingCamSide(monster);
      this.sound.playEatingStrike(1.0);
      this.camShake = Math.max(this.camShake, 0.48);
    } else {
      this.jumpscareTimer = 0.95;
      if (reason === 'caught') {
        this.playerRig.setVisible(false);
      }
      this.sound.playJumpscare();
    }

    this.heldKeys.clear();
    this.virtualMove.x = 0;
    this.virtualMove.y = 0;
    this.virtualRun = false;
    this.virtualAutoRun = false;
    this.isDraggingLook = false;
    this.jumpBufferTimer = 0;
    try {
      if (document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock();
      }
    } catch {
      // ignore pointer lock errors inside sandboxed iframes
    }
    this.sound.updateAtmosphere(this.simTime, 2, 'chasing', false, false, false);
    this.callbacks.onPhaseChange('jumpscare', { deathReason: reason });
  }

  private updateJumpscare(dt: number): void {
    this.jumpscareTimer -= dt;
    if (this.jumpscareMonster) {
      const m = this.jumpscareMonster;
      const waterY = this.currentLevel.bounds.waterY;
      const b = this.currentLevel.bounds;

      // Full realistic eating sequence when caught by a sea serpent
      if (m.eatingUserId) {
        this.stepMonsterEating(m, dt, true);
        this.updateEatingCamera(m, m.eatingProgress, dt);

        if (this.jumpscareTimer <= 0) {
          if (this.isMultiplayer) {
            // Wait cleanly for authoritative 'caught' event unless timed out past safety margin
            if (this.mpLocalAlive && this.jumpscareTimer > -0.8) {
              return;
            }
            this.mpLocalBeingEaten = false;
            this.mpLocalAlive = false;
            this.playerRig.setVisible(false);
            this.playerRig.root.scale.setScalar(1);
            m.eatingUserId = null;
            m.eatingProgress = -1;
            this.jumpscareMonster = null;
            this.phase = 'playing';
            this.callbacks.onMultiplayerCaught?.();
            this.callbacks.onPhaseChange('playing');
            this.emitHud();
          } else {
            // Hide player ONLY once swallowing animation has completed
            this.playerRig.setVisible(false);
            this.playerRig.root.scale.setScalar(1);
            this.playerRig.root.rotation.set(0, this.playerYaw, 0);
            m.eatingUserId = null;
            m.eatingProgress = -1;
            this.phase = 'gameover';
            this.callbacks.onPhaseChange('gameover', { deathReason: this.deathReason || 'caught' });
          }
        }
        return;
      }

      // Timeout or fallback lunge
      const progress = THREE.MathUtils.clamp(1 - this.jumpscareTimer / 0.95, 0, 1);
      m.rig.emergeAmount = 1;
      m.pos.y = waterY - 0.14;
      m.rig.root.position.copy(m.pos);
      m.rig.root.rotation.y = 0;

      const lungeDist = THREE.MathUtils.lerp(2.95, 1.85, progress);
      const headWorld = _vPlayerPos.set(
        m.pos.x + Math.sin(m.yaw) * 0.86 * m.scale,
        m.pos.y + 1.82 * m.scale,
        m.pos.z + Math.cos(m.yaw) * 0.86 * m.scale
      );
      const camSpot = _vCamPos.set(
        m.pos.x + Math.sin(m.yaw) * lungeDist * m.scale,
        m.pos.y + 1.78 * m.scale,
        m.pos.z + Math.cos(m.yaw) * lungeDist * m.scale
      );

      camSpot.x = THREE.MathUtils.clamp(camSpot.x, b.minX + 0.45, b.maxX - 0.45);
      camSpot.z = THREE.MathUtils.clamp(camSpot.z, b.minZ + 0.45, b.maxZ - 0.45);
      camSpot.y = THREE.MathUtils.clamp(camSpot.y, b.floorY + 0.4, b.ceilingY - 0.4);

      const bestCamT = this.computeCameraWallOcclusion(
        headWorld.x,
        headWorld.y,
        headWorld.z,
        camSpot.x,
        camSpot.y,
        camSpot.z,
        0.25
      );
      if (bestCamT < 1.0) {
        const safeT = Math.max(0.35, bestCamT * 0.94);
        camSpot.set(
          headWorld.x + (camSpot.x - headWorld.x) * safeT,
          headWorld.y + (camSpot.y - headWorld.y) * safeT,
          headWorld.z + (camSpot.z - headWorld.z) * safeT
        );
      }

      if (Math.hypot(camSpot.x - headWorld.x, camSpot.z - headWorld.z) < 0.08) {
        const safeScale = m.scale || 1;
        camSpot.x = THREE.MathUtils.clamp(
          headWorld.x + Math.sin(m.yaw) * 0.45 * safeScale,
          b.minX + 0.45,
          b.maxX - 0.45
        );
        camSpot.z = THREE.MathUtils.clamp(
          headWorld.z + Math.cos(m.yaw) * 0.45 * safeScale,
          b.minZ + 0.45,
          b.maxZ - 0.45
        );
        if (Math.hypot(camSpot.x - headWorld.x, camSpot.z - headWorld.z) < 0.05) {
          camSpot.z = headWorld.z + (headWorld.z > 0 ? -0.35 : 0.35);
        }
      }

      this.camera.position.copy(camSpot);
      this.camera.position.x += (Math.random() - 0.5) * 0.24;
      this.camera.position.y += (Math.random() - 0.5) * 0.24;
      this.camera.lookAt(headWorld);
      animateMonsterRig(m.rig, 'chasing', camSpot, m.pos, m.yaw, waterY, this.simTime * 2.4, dt, 1);
    }

    if (this.jumpscareTimer <= 0) {
      if (this.isMultiplayer) {
        this.jumpscareMonster = null;
        this.phase = 'playing';
        this.callbacks.onPhaseChange('playing');
        this.emitHud();
      } else {
        this.phase = 'gameover';
        this.callbacks.onPhaseChange('gameover', { deathReason: this.deathReason || 'caught' });
      }
    }
  }

  private emitHud(force = false): void {
    let minMonsterDist = 999;
    let alertState: 'calm' | 'searching' | 'chasing' = 'calm';
    for (const m of this.monsters) {
      const d = Math.hypot(this.playerPos.x - m.pos.x, this.playerPos.z - m.pos.z);
      if (d < minMonsterDist) minMonsterDist = d;
      if (m.alert === 'chasing') alertState = 'chasing';
      else if (m.alert === 'searching' && alertState === 'calm') alertState = 'searching';
    }

    const spectating = this.isMultiplayer && (!this.mpLocalAlive || this.mpLocalEscaped);
    const timeRemaining = Math.round(Math.max(0, this.levelTimeRemaining) * 10) / 10;
    const timeElapsed = Math.round(this.levelTimeElapsed * 10) / 10;
    const stamina = Math.round(this.stamina);
    const inWater = spectating ? false : this.inWater;
    const underwater = spectating ? false : this.camera.position.y < this.currentLevel.bounds.waterY;
    const waterJumpCooldown =
      !spectating && this.inWater ? Math.round(Math.max(0, this.waterJumpCooldown) * 10) / 10 : 0;
    const monsterDist = Math.round(minMonsterDist);
    const pushCooldown =
      this.isMultiplayer && !spectating ? Math.round(Math.max(0, this.pushCooldownTimer) * 10) / 10 : 0;
    const canPushTarget = this.isMultiplayer && !spectating ? this.canPushTargetCache : false;

    const prev = this.lastHudSnap;
    if (
      !force &&
      prev.levelId === this.currentLevel.id &&
      prev.timeRemaining === timeRemaining &&
      prev.timeElapsed === timeElapsed &&
      prev.stamina === stamina &&
      prev.inWater === inWater &&
      prev.underwater === underwater &&
      prev.waterJumpCooldown === waterJumpCooldown &&
      prev.monsterDist === monsterDist &&
      prev.monsterAlert === alertState &&
      prev.checkpointIndex === this.activeCheckpointIndex &&
      prev.totalCheckpoints === this.checkpoints.length &&
      prev.checkpointNotice === this.checkpointNotice &&
      prev.activeQuality === this.activeQuality &&
      prev.fps === this.currentFps &&
      prev.isPointerLocked === this.isPointerLocked &&
      prev.deathReason === this.deathReason &&
      prev.isMultiplayer === this.isMultiplayer &&
      prev.pushCooldown === pushCooldown &&
      prev.canPushTarget === canPushTarget
    ) {
      return;
    }

    prev.levelId = this.currentLevel.id;
    prev.timeRemaining = timeRemaining;
    prev.timeElapsed = timeElapsed;
    prev.stamina = stamina;
    prev.inWater = inWater;
    prev.underwater = underwater;
    prev.waterJumpCooldown = waterJumpCooldown;
    prev.monsterDist = monsterDist;
    prev.monsterAlert = alertState;
    prev.checkpointIndex = this.activeCheckpointIndex;
    prev.totalCheckpoints = this.checkpoints.length;
    prev.checkpointNotice = this.checkpointNotice;
    prev.activeQuality = this.activeQuality;
    prev.fps = this.currentFps;
    prev.isPointerLocked = this.isPointerLocked;
    prev.deathReason = this.deathReason;
    prev.isMultiplayer = this.isMultiplayer;
    prev.pushCooldown = pushCooldown;
    prev.canPushTarget = canPushTarget;

    this.callbacks.onHudUpdate({
      levelId: this.currentLevel.id,
      levelCode: this.currentLevel.code,
      levelName: this.currentLevel.name,
      timeRemaining,
      timeElapsed,
      stamina,
      inWater,
      underwater,
      waterJumpCooldown,
      monsterDist,
      monsterAlert: alertState,
      checkpointIndex: this.activeCheckpointIndex,
      totalCheckpoints: this.checkpoints.length,
      checkpointNotice: this.checkpointNotice,
      activeQuality: this.activeQuality,
      fps: this.currentFps,
      isPointerLocked: this.isPointerLocked,
      deathReason: this.deathReason,
      isMultiplayer: this.isMultiplayer,
      pushCooldown,
      pushMaxCooldown: PUSH_COOLDOWN_MS / 1000,
      canPushTarget,
    });
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    this.sound.unlock();
    if (e.code === 'Escape') {
      if (this.phase === 'playing') {
        this.setPhase('paused');
        this.callbacks.onPhaseChange('paused');
      } else if (this.phase === 'paused') {
        this.setPhase('playing');
        this.callbacks.onPhaseChange('playing');
      }
      return;
    }

    if (this.phase !== 'playing') return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) this.triggerJump();
    } else if (e.code === 'KeyF' && this.isMultiplayer) {
      if (!e.repeat) this.triggerPush();
    }
    this.heldKeys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.heldKeys.delete(e.code);
  };

  private onWindowBlur = (): void => {
    this.heldKeys.clear();
    this.isDraggingLook = false;
  };

  private onPointerDown = (e: PointerEvent): void => {
    this.sound.unlock();
    if (this.phase !== 'playing') return;
    if (e.pointerType === 'mouse') {
      this.isDraggingLook = true;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      // Request pointer lock on desktop canvas click for smooth FPS/TPS mouse look
      if (document.pointerLockElement !== this.renderer.domElement && e.button === 0) {
        try {
          this.renderer.domElement.requestPointerLock?.();
        } catch {
          // fallback to drag-look if pointer lock is blocked by iframe sandbox
        }
      }
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.phase !== 'playing') return;
    if (document.pointerLockElement === this.renderer.domElement) {
      this.rotateCameraByDelta(e.movementX, e.movementY);
    } else if (this.isDraggingLook && e.pointerType === 'mouse') {
      const dx = e.clientX - this.lastPointerX;
      const dy = e.clientY - this.lastPointerY;
      this.lastPointerX = e.clientX;
      this.lastPointerY = e.clientY;
      this.rotateCameraByDelta(dx, dy);
    }
  };

  private onPointerUp = (): void => {
    this.isDraggingLook = false;
  };

  private onPointerLockChange = (): void => {
    this.isPointerLocked = document.pointerLockElement === this.renderer.domElement;
    this.emitHud();
  };

  private onResize = (): void => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private bindEvents(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);

    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  }

  public dispose(): void {
    this.disposed = true;
    this.cancelScheduledTick();

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);

    this.clearLevel();
    this.playerRig.dispose();
    disposeEntityResources(this.textures);
    this.scene.remove(this.splashMesh);
    this.splashMesh.dispose();
    this.splashGeo.dispose();
    this.splashMat.dispose();
    this.textures.dispose();
    this.envRT?.dispose();
    this.sound.dispose();
    this.renderer.dispose();
    if (dom.parentElement === this.container) {
      this.container.removeChild(dom);
    }
  }
}
