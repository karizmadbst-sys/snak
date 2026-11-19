import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import {
  computeStars,
  GameOverModal,
  isLevelUnlocked,
  LevelSelectModal,
  MainMenu,
  PauseModal,
  SettingsModal,
  VictoryModal,
} from './components/Modals';
import {
  InviteNotifications,
  MultiplayerModal,
  MultiplayerResultModal,
  MultiplayerStatusPill,
} from './components/MultiplayerModal';
import { TouchControls, TouchControlsCustomizer } from './components/TouchControls';
import { InGameVoiceHud } from './components/VoiceControls';
import { PoolGameEngine } from './game/engine';
import { LEVELS } from './game/levels';
import {
  DEFAULT_SETTINGS,
  DEFAULT_TOUCH_LAYOUT,
  GamePhase,
  GameSettings,
  HudSnapshot,
  normalizeQualityPreset,
  SaveData,
  TouchControlPlacement,
  TouchLayoutConfig,
} from './game/types';
import { MultiplayerClient, type MultiplayerSnapshot } from './multiplayer/client';
import type { MatchResultSummary } from './multiplayer/types';
import { VoiceChatManager, type VoiceChatSnapshot } from './multiplayer/voice';

const STORAGE_SAVE_KEY = 'deep_tile_save_v1';
const STORAGE_SETTINGS_KEY = 'deep_tile_settings_v1';
const STORAGE_TOUCH_LAYOUT_KEY = 'deep_tile_touch_layout_v1';

function loadSaveData(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_SAVE_KEY);
    return raw ? (JSON.parse(raw) as SaveData) : {};
  } catch {
    return {};
  }
}

function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      quality: normalizeQualityPreset(parsed.quality),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function sanitizePlacement(
  raw: Partial<TouchControlPlacement> | undefined,
  fallback: TouchControlPlacement
): TouchControlPlacement {
  const num = (v: unknown, def: number, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : def;
  return {
    xPct: num(raw?.xPct, fallback.xPct, 5, 95),
    yPct: num(raw?.yPct, fallback.yPct, 14, 93),
    scale: num(raw?.scale, fallback.scale, 0.65, 1.45),
    opacity: num(raw?.opacity, fallback.opacity, 0.3, 1),
  };
}

function loadTouchLayout(): TouchLayoutConfig {
  try {
    const raw = localStorage.getItem(STORAGE_TOUCH_LAYOUT_KEY);
    if (!raw) return DEFAULT_TOUCH_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<TouchLayoutConfig>;
    return {
      joystick: sanitizePlacement(parsed.joystick, DEFAULT_TOUCH_LAYOUT.joystick),
      autoRun: sanitizePlacement(parsed.autoRun, DEFAULT_TOUCH_LAYOUT.autoRun),
      jump: sanitizePlacement(parsed.jump, DEFAULT_TOUCH_LAYOUT.jump),
      push: sanitizePlacement(parsed.push, DEFAULT_TOUCH_LAYOUT.push),
    };
  } catch {
    return DEFAULT_TOUCH_LAYOUT;
  }
}

const INITIAL_HUD: HudSnapshot = {
  levelId: 1,
  levelCode: LEVELS[0].code,
  levelName: LEVELS[0].name,
  timeRemaining: LEVELS[0].timeLimit,
  timeElapsed: 0,
  stamina: 100,
  inWater: false,
  underwater: false,
  waterJumpCooldown: 0,
  monsterDist: 30,
  monsterAlert: 'calm',
  checkpointIndex: 0,
  totalCheckpoints: 1,
  checkpointNotice: null,
  activeQuality: 'standard',
  fps: 60,
  isPointerLocked: false,
  deathReason: null,
  isMultiplayer: false,
  pushCooldown: 0,
  pushMaxCooldown: 2.5,
  canPushTarget: false,
};

export default function App() {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<PoolGameEngine | null>(null);
  const mpClientRef = useRef<MultiplayerClient | null>(null);
  if (!mpClientRef.current) {
    mpClientRef.current = new MultiplayerClient();
  }
  const mpClient = mpClientRef.current;

  const [phase, setPhase] = useState<GamePhase>('menu');
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const [touchLayout, setTouchLayout] = useState<TouchLayoutConfig>(() => loadTouchLayout());
  const [saveData, setSaveData] = useState<SaveData>(() => loadSaveData());
  const [showLevels, setShowLevels] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTouchCustomizer, setShowTouchCustomizer] = useState(false);
  const [returnToSettingsAfterCustomize, setReturnToSettingsAfterCustomize] = useState(false);
  const [showMultiplayer, setShowMultiplayer] = useState(false);
  const [deathReason, setDeathReason] = useState<'caught' | 'timeout'>('caught');
  const [victoryElapsed, setVictoryElapsed] = useState(0);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  // Multiplayer runtime state
  const [mpSnap, setMpSnap] = useState<MultiplayerSnapshot>(() => mpClient.getSnapshot());
  const voiceMgrRef = useRef<VoiceChatManager | null>(null);
  if (!voiceMgrRef.current) {
    voiceMgrRef.current = new VoiceChatManager(
      mpClient,
      settings.voiceEnabled,
      settings.voiceVolume
    );
  }
  const voiceMgr = voiceMgrRef.current;
  const [voiceSnap, setVoiceSnap] = useState<VoiceChatSnapshot>(() => voiceMgr.getSnapshot());
  const [isMultiplayerMatch, setIsMultiplayerMatch] = useState(false);
  const [mpLocalStatus, setMpLocalStatus] = useState<'playing' | 'caught' | 'escaped'>('playing');
  const [mpAliveCount, setMpAliveCount] = useState(0);
  const [mpTotalCount, setMpTotalCount] = useState(0);
  const [mpMatchResult, setMpMatchResult] = useState<MatchResultSummary | null>(null);

  const activeLevelIdRef = useRef<number>(1);
  const latestElapsedRef = useRef<number>(0);
  const isMpMatchRef = useRef<boolean>(false);
  isMpMatchRef.current = isMultiplayerMatch;

  useEffect(() => {
    const hasTouch =
      'ontouchstart' in window || navigator.maxTouchPoints > 0;
    setIsTouchDevice(hasTouch);
  }, []);

  // Mount Three.js engine once in isolated container
  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;

    const engine = new PoolGameEngine(host, settings, {
      onHudUpdate: (snapshot) => {
        activeLevelIdRef.current = snapshot.levelId;
        latestElapsedRef.current = snapshot.timeElapsed;
        setHud(snapshot);
      },
      onPhaseChange: (nextPhase, extra) => {
        setPhase(nextPhase);
        if (extra?.deathReason) {
          setDeathReason(extra.deathReason);
        }
        if (nextPhase === 'victory' && extra?.elapsed != null && !isMpMatchRef.current) {
          const lvlId = activeLevelIdRef.current;
          const lvl = LEVELS.find((l) => l.id === lvlId) || LEVELS[0];
          const stars = computeStars(lvl, extra.elapsed);
          setVictoryElapsed(extra.elapsed);

          setSaveData((prev) => {
            const existing = prev[lvlId];
            const bestTime =
              existing?.bestTime != null
                ? Math.min(existing.bestTime, extra.elapsed!)
                : extra.elapsed!;
            const nextSave: SaveData = {
              ...prev,
              [lvlId]: {
                completed: true,
                bestTime,
                stars: Math.max(existing?.stars || 0, stars),
              },
            };
            try {
              localStorage.setItem(STORAGE_SAVE_KEY, JSON.stringify(nextSave));
            } catch {
              // ignore quota errors
            }
            return nextSave;
          });
        }
      },
      onMultiplayerTick: (pkt) => {
        mpClient.sendPlayerInputState(pkt);
      },
      onMultiplayerPush: (pkt) => {
        mpClient.sendPush(pkt);
      },
      onMultiplayerCaught: () => {
        setMpLocalStatus('caught');
      },
      onMultiplayerEscaped: () => {
        setMpLocalStatus('escaped');
        const lvlId = activeLevelIdRef.current;
        const elapsed = Math.max(1, Math.round(latestElapsedRef.current * 10) / 10);
        const lvl = LEVELS.find((l) => l.id === lvlId) || LEVELS[0];
        const stars = computeStars(lvl, elapsed);
        setSaveData((prev) => {
          const existing = prev[lvlId];
          const bestTime =
            existing?.bestTime != null ? Math.min(existing.bestTime, elapsed) : elapsed;
          const nextSave: SaveData = {
            ...prev,
            [lvlId]: {
              completed: true,
              bestTime,
              stars: Math.max(existing?.stars || 0, stars),
            },
          };
          try {
            localStorage.setItem(STORAGE_SAVE_KEY, JSON.stringify(nextSave));
          } catch {
            // ignore quota errors
          }
          return nextSave;
        });
      },
    });

    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Connect & subscribe to real-time MultiplayerClient events
  useEffect(() => {
    const unsubSnap = mpClient.subscribe((snap) => {
      setMpSnap(snap);
      if (isMpMatchRef.current && snap.room && snap.room.status === 'lobby') {
        setIsMultiplayerMatch(false);
        setMpMatchResult(null);
        setMpLocalStatus('playing');
        setPhase('menu');
        setShowMultiplayer(true);
        engineRef.current?.exitMultiplayerMode();
        engineRef.current?.showMenuBackdrop(snap.room.levelId);
      }
    });

    const unsubStart = mpClient.onGameStarted((payload) => {
      const uid = mpClient.getSnapshot().user?.id;
      if (!uid) return;
      setShowMultiplayer(false);
      setShowLevels(false);
      setShowSettings(false);
      setMpMatchResult(null);
      setMpLocalStatus('playing');
      setMpAliveCount(payload.players.filter((p) => p.alive && !p.escaped).length);
      setMpTotalCount(payload.players.length);
      setIsMultiplayerMatch(true);
      setPhase('playing');
      engineRef.current?.startMultiplayerLevel(
        payload.levelId,
        uid,
        payload.players,
        payload.monsters,
        payload.elapsedSec ?? 0
      );
    });

    const unsubWorld = mpClient.onWorldSync((world) => {
      engineRef.current?.applyMultiplayerWorld(world);
      let aliveCount = 0;
      for (let i = 0; i < world.players.length; i++) {
        const p = world.players[i];
        if (p.alive && !p.escaped) aliveCount++;
      }
      setMpAliveCount((prev) => (prev === aliveCount ? prev : aliveCount));
      setMpTotalCount((prev) => (prev === world.players.length ? prev : world.players.length));
      if (world.matchResult) {
        setMpMatchResult((prev) => prev ?? world.matchResult!);
      }
    });

    const unsubPlayerEvent = mpClient.onPlayerEvent((ev) => {
      engineRef.current?.handleMultiplayerPlayerEvent(ev);
    });

    const unsubNotice = mpClient.onRoomNotice(() => {
      if (isMpMatchRef.current) {
        setIsMultiplayerMatch(false);
        setMpMatchResult(null);
        setMpLocalStatus('playing');
        setPhase('menu');
        setShowMultiplayer(true);
        engineRef.current?.exitMultiplayerMode();
        engineRef.current?.showMenuBackdrop(1);
      }
    });

    void mpClient.restoreSession();

    return () => {
      unsubSnap();
      unsubStart();
      unsubWorld();
      unsubPlayerEvent();
      unsubNotice();
      mpClient.dispose();
    };
  }, [mpClient]);

  // VoiceChatManager lifecycle & room-scoped synchronization
  useEffect(() => {
    const unsubVoice = voiceMgr.subscribe(setVoiceSnap);
    return () => {
      unsubVoice();
      voiceMgr.dispose();
    };
  }, [voiceMgr]);

  useEffect(() => {
    voiceMgr.syncRoomContext(mpSnap.user?.id || null, mpSnap.room);
  }, [voiceMgr, mpSnap.user?.id, mpSnap.room]);

  useEffect(() => {
    if (isMultiplayerMatch && mpMatchResult && phase !== 'jumpscare' && phase !== 'paused') {
      engineRef.current?.setPhase('paused');
      setPhase('paused');
    }
  }, [isMultiplayerMatch, mpMatchResult, phase]);

  const handleSettingsChange = useCallback(
    (next: GameSettings) => {
      setSettings(next);
      engineRef.current?.updateSettings(next);
      voiceMgr.setVoiceActive(next.voiceEnabled);
      voiceMgr.setVoiceVolume(next.voiceVolume);
      try {
        localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
    },
    [voiceMgr]
  );

  const handleToggleMute = useCallback(() => {
    handleSettingsChange({ ...settings, muted: !settings.muted });
  }, [settings, handleSettingsChange]);

  const handleMasterVoiceToggle = useCallback(
    (enabled: boolean) => {
      handleSettingsChange({ ...settings, voiceEnabled: enabled });
    },
    [settings, handleSettingsChange]
  );

  const handleVoiceVolumeChange = useCallback(
    (volume: number) => {
      handleSettingsChange({ ...settings, voiceVolume: volume });
    },
    [settings, handleSettingsChange]
  );

  const handleStartLevel = useCallback(
    (levelId: number) => {
      const targetId = isLevelUnlocked(levelId, saveData) ? levelId : 1;
      setIsMultiplayerMatch(false);
      setMpMatchResult(null);
      setShowLevels(false);
      setShowSettings(false);
      setShowMultiplayer(false);
      setPhase('playing');
      engineRef.current?.startLevel(targetId);
    },
    [saveData]
  );

  const handleRestart = useCallback(() => {
    if (isMpMatchRef.current) return;
    setPhase('playing');
    engineRef.current?.restartLevel();
  }, []);

  const handleRespawnCheckpoint = useCallback(() => {
    if (isMpMatchRef.current) return;
    setPhase('playing');
    engineRef.current?.respawnAtCheckpoint();
  }, []);

  const handlePause = useCallback(() => {
    setPhase('paused');
    engineRef.current?.setPhase('paused');
  }, []);

  const handleResume = useCallback(() => {
    setShowSettings(false);
    setShowLevels(false);
    setPhase('playing');
    engineRef.current?.setPhase('playing');
  }, []);

  const handleQuitToMenu = useCallback(() => {
    if (isMpMatchRef.current) {
      mpClient.leaveRoom();
      setIsMultiplayerMatch(false);
      setMpMatchResult(null);
      setMpLocalStatus('playing');
      engineRef.current?.exitMultiplayerMode();
    }
    setShowSettings(false);
    setShowLevels(false);
    setPhase('menu');
    engineRef.current?.showMenuBackdrop(1);
  }, [mpClient]);

  const handleVirtualMove = useCallback((x: number, y: number, run: boolean) => {
    engineRef.current?.setVirtualInput(x, y, run);
  }, []);

  const handleVirtualAutoRun = useCallback((enabled: boolean) => {
    engineRef.current?.setVirtualAutoRun(enabled);
  }, []);

  const handleVirtualJump = useCallback(() => {
    engineRef.current?.triggerJump();
  }, []);

  const handleVirtualPush = useCallback(() => {
    engineRef.current?.triggerPush();
  }, []);

  const handleVirtualCamDelta = useCallback((dx: number, dy: number) => {
    engineRef.current?.rotateCameraByDelta(dx, dy);
  }, []);

  const handleOpenCustomizeControls = useCallback(() => {
    setReturnToSettingsAfterCustomize(true);
    setShowSettings(false);
    setShowTouchCustomizer(true);
  }, []);

  const handleSaveTouchLayout = useCallback(
    (nextLayout: TouchLayoutConfig) => {
      setTouchLayout(nextLayout);
      try {
        localStorage.setItem(STORAGE_TOUCH_LAYOUT_KEY, JSON.stringify(nextLayout));
      } catch {
        // ignore quota errors
      }
      setShowTouchCustomizer(false);
      if (returnToSettingsAfterCustomize) {
        setShowSettings(true);
        setReturnToSettingsAfterCustomize(false);
      }
    },
    [returnToSettingsAfterCustomize]
  );

  const handleCancelTouchLayout = useCallback(() => {
    setShowTouchCustomizer(false);
    if (returnToSettingsAfterCustomize) {
      setShowSettings(true);
      setReturnToSettingsAfterCustomize(false);
    }
  }, [returnToSettingsAfterCustomize]);

  // Determine current unlocked frontier sector for Main Menu CTA
  const continueLevelId = (() => {
    for (const lvl of LEVELS) {
      if (!saveData[lvl.id]?.completed && isLevelUnlocked(lvl.id, saveData)) return lvl.id;
    }
    return LEVELS[LEVELS.length - 1]?.id || 1;
  })();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement | null)?.tagName;
      if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT') return;
      if (showLevels || showSettings || showMultiplayer || showTouchCustomizer) return;
      if (phase === 'menu' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        handleStartLevel(continueLevelId);
      } else if (phase === 'gameover' && !isMpMatchRef.current && (e.code === 'KeyR' || e.code === 'Enter')) {
        e.preventDefault();
        handleRestart();
      } else if (phase === 'playing' && isMpMatchRef.current && e.code === 'KeyV') {
        e.preventDefault();
        const cur = voiceMgr.getSnapshot();
        if (cur.micEnabled) {
          voiceMgr.setSelfMuted(!cur.selfMuted);
        } else {
          if (!cur.voiceActive) handleMasterVoiceToggle(true);
          void voiceMgr.enableMicrophone();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    phase,
    showLevels,
    showSettings,
    showMultiplayer,
    showTouchCustomizer,
    continueLevelId,
    handleStartLevel,
    handleRestart,
    voiceMgr,
    handleMasterVoiceToggle,
  ]);

  const currentLevel = LEVELS.find((l) => l.id === hud.levelId) || LEVELS[0];
  const showTouch =
    phase === 'playing' &&
    !showLevels &&
    !showSettings &&
    !showTouchCustomizer &&
    !showMultiplayer &&
    !mpMatchResult &&
    (!isMultiplayerMatch || mpLocalStatus === 'playing') &&
    (settings.touchControls === 'on' ||
      (settings.touchControls === 'auto' && isTouchDevice));

  const mpBadgeCount = mpSnap.pendingInvites.length + mpSnap.incomingRequests.length;

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0b1012]">
      {/* Isolated WebGL Canvas Host */}
      <div ref={canvasHostRef} className="game-canvas-host absolute inset-0 z-0" />

      {/* Live Room Invite Toast Notifications */}
      {!isMultiplayerMatch && (
        <InviteNotifications
          invites={mpSnap.pendingInvites}
          onAccept={(id) => {
            mpClient.respondToInvite(id, true);
            setShowMultiplayer(true);
          }}
          onDecline={(id) => mpClient.respondToInvite(id, false)}
        />
      )}

      {/* Main Menu */}
      {phase === 'menu' && (
        <MainMenu
          continueLevelId={continueLevelId}
          onPlay={handleStartLevel}
          onOpenLevels={() => setShowLevels(true)}
          onOpenSettings={() => setShowSettings(true)}
          onOpenMultiplayer={() => setShowMultiplayer(true)}
          multiplayerBadge={mpBadgeCount}
        />
      )}

      {/* Active Gameplay HUD */}
      {phase === 'playing' && (
        <GameHud
          hud={hud}
          muted={settings.muted}
          showTouchControls={showTouch}
          onToggleMute={handleToggleMute}
          onPause={handlePause}
          onPush={handleVirtualPush}
        />
      )}

      {/* In-Game Multiplayer Voice Chat HUD */}
      {isMultiplayerMatch && phase === 'playing' && mpSnap.room && (
        <InGameVoiceHud
          voiceMgr={voiceMgr}
          voiceSnap={voiceSnap}
          players={mpSnap.room.players}
          localUserId={mpSnap.user?.id || null}
          voiceVolume={settings.voiceVolume}
          onMasterVoiceToggle={handleMasterVoiceToggle}
          onVoiceVolumeChange={handleVoiceVolumeChange}
        />
      )}

      {/* Multiplayer Spectator / Escaped Banner */}
      {isMultiplayerMatch && phase === 'playing' && !mpMatchResult && mpLocalStatus !== 'playing' && (
        <MultiplayerStatusPill
          status={mpLocalStatus}
          aliveCount={mpAliveCount}
          totalCount={mpTotalCount}
          onLeave={handleQuitToMenu}
        />
      )}

      {/* Mobile / Tablet Touch Controls */}
      {showTouch && (
        <TouchControls
          key={hud.levelId}
          inWater={hud.inWater}
          waterJumpCooldown={hud.waterJumpCooldown}
          isFriendsMode={isMultiplayerMatch}
          pushCooldown={hud.pushCooldown}
          pushMaxCooldown={hud.pushMaxCooldown}
          canPushTarget={hud.canPushTarget}
          layout={touchLayout}
          onMove={handleVirtualMove}
          onAutoRunChange={handleVirtualAutoRun}
          onJump={handleVirtualJump}
          onPush={handleVirtualPush}
          onCameraDelta={handleVirtualCamDelta}
        />
      )}

      {/* Jumpscare / Eating Impact Peripheral Tint */}
      {phase === 'jumpscare' && (
        <div
          className="fixed inset-0 z-25 pointer-events-none"
          style={{
            background:
              deathReason === 'caught'
                ? 'radial-gradient(circle at center, rgba(255,35,35,0.04) 38%, rgba(130,0,10,0.34) 100%)'
                : 'radial-gradient(circle at center, rgba(255,40,40,0.12) 20%, rgba(160,0,10,0.72) 100%)',
          }}
        />
      )}

      {/* Pause Menu */}
      {phase === 'paused' && !showLevels && !showSettings && !showTouchCustomizer && (
        <PauseModal
          levelCode={currentLevel.code}
          levelName={currentLevel.name}
          isMultiplayer={isMultiplayerMatch}
          onResume={handleResume}
          onRestart={isMultiplayerMatch ? handleResume : handleRestart}
          onSettings={() => setShowSettings(true)}
          onLevels={() => {
            if (!isMultiplayerMatch) setShowLevels(true);
          }}
          onQuitMenu={handleQuitToMenu}
        />
      )}

      {/* Single-player Game Over */}
      {!isMultiplayerMatch && phase === 'gameover' && !showLevels && (
        <GameOverModal
          reason={deathReason}
          levelCode={currentLevel.code}
          levelName={currentLevel.name}
          hasCheckpoint={hud.checkpointIndex > 0}
          onRetry={handleRestart}
          onCheckpoint={handleRespawnCheckpoint}
          onLevels={() => setShowLevels(true)}
          onMenu={handleQuitToMenu}
        />
      )}

      {/* Single-player Victory */}
      {!isMultiplayerMatch && phase === 'victory' && !showLevels && (
        <VictoryModal
          level={currentLevel}
          elapsed={victoryElapsed}
          hasNextLevel={currentLevel.id < LEVELS.length}
          onNextLevel={() => handleStartLevel(currentLevel.id + 1)}
          onReplay={handleRestart}
          onLevels={() => setShowLevels(true)}
        />
      )}

      {/* Multiplayer Match Result */}
      {isMultiplayerMatch && mpMatchResult && phase !== 'jumpscare' && (
        <MultiplayerResultModal
          result={mpMatchResult}
          room={mpSnap.room}
          localUserId={mpSnap.user?.id || null}
          onReturnLobby={() => mpClient.returnToLobby()}
          onLeaveRoom={handleQuitToMenu}
        />
      )}

      {/* Multiplayer Hub Modal */}
      {showMultiplayer && (
        <MultiplayerModal
          client={mpClient}
          snapshot={mpSnap}
          voiceMgr={voiceMgr}
          voiceSnap={voiceSnap}
          voiceVolume={settings.voiceVolume}
          onMasterVoiceToggle={handleMasterVoiceToggle}
          onVoiceVolumeChange={handleVoiceVolumeChange}
          onClose={() => setShowMultiplayer(false)}
        />
      )}

      {/* Level Select Modal */}
      {showLevels && (
        <LevelSelectModal
          saveData={saveData}
          onSelect={handleStartLevel}
          onClose={() => setShowLevels(false)}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          settings={settings}
          showCustomizeControls={isTouchDevice || settings.touchControls !== 'off'}
          onOpenCustomizeControls={handleOpenCustomizeControls}
          onChange={handleSettingsChange}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Mobile Touch Controls Customizer */}
      {showTouchCustomizer && (
        <TouchControlsCustomizer
          savedLayout={touchLayout}
          onSave={handleSaveTouchLayout}
          onCancel={handleCancelTouchLayout}
        />
      )}
    </div>
  );
}
