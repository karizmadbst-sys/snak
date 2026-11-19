import React, { useMemo, useState } from 'react';
import {
  ChevronRight,
  Grid,
  Lock,
  Play,
  RotateCcw,
  Settings,
  Sliders,
  Star,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { LEVELS, SECTOR_WINGS } from '../game/levels';
import {
  GameSettings,
  LevelDef,
  QualityPreset,
  SaveData,
  TouchControlsMode,
} from '../game/types';

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

export function computeStars(level: LevelDef, elapsed: number): number {
  if (elapsed <= level.parTimes[0]) return 3;
  if (elapsed <= level.parTimes[1]) return 2;
  return 1;
}

export function isLevelUnlocked(levelId: number, saveData: SaveData): boolean {
  if (levelId <= 1) return true;
  return Boolean(saveData[levelId]?.completed || saveData[levelId - 1]?.completed);
}

/* ============================================================================
 * MAIN MENU
 * ==========================================================================*/
interface MainMenuProps {
  continueLevelId: number;
  onPlay: (levelId: number) => void;
  onOpenLevels: () => void;
  onOpenSettings: () => void;
  onOpenMultiplayer: () => void;
  multiplayerBadge?: number;
}

export const MainMenu: React.FC<MainMenuProps> = ({
  continueLevelId,
  onPlay,
  onOpenLevels,
  onOpenSettings,
  onOpenMultiplayer,
  multiplayerBadge = 0,
}) => {
  const targetLevel = LEVELS.find((l) => l.id === continueLevelId) || LEVELS[0];

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between p-6 md:p-12 pointer-events-none bg-gradient-to-r from-[#070b0d]/88 via-[#0a1013]/45 to-transparent">
      {/* Top subtle classification tag */}
      <div className="text-xs font-mono tracking-[0.25em] text-[#7f9aa1] uppercase">
        SUBSURFACE NATATORIUM · FACILITY 09
      </div>

      {/* Left-aligned Title Lockup & Actions over negative space */}
      <div className="max-w-xl flex flex-col gap-6 pointer-events-auto my-auto">
        <div className="flex flex-col gap-3">
          {/* Title Lockup with Official SERPENTIS Icon */}
          <svg
            viewBox="0 0 380 86"
            className="w-72 md:w-96 h-auto"
            aria-label="SERPENTIS"
          >
            <defs>
              <clipPath id="serpentis-emblem-clip">
                <rect x="2" y="10" width="56" height="56" rx="6" />
              </clipPath>
            </defs>
            <image
              href="/pwa-192x192.png?v=2"
              x="2"
              y="10"
              width="56"
              height="56"
              preserveAspectRatio="xMidYMid slice"
              clipPath="url(#serpentis-emblem-clip)"
            />
            <rect
              x="2"
              y="10"
              width="56"
              height="56"
              rx="6"
              fill="none"
              stroke="#52e0b6"
              strokeOpacity="0.55"
              strokeWidth="1.5"
            />
            <text
              x="76"
              y="46"
              fill="#e9f2f4"
              fontFamily="Inter, system-ui, sans-serif"
              fontWeight="800"
              fontSize="38"
              letterSpacing="5.5"
            >
              SERPENTIS
            </text>
            <text
              x="78"
              y="67"
              fill="#7fa1a8"
              fontFamily="monospace"
              fontSize="11.5"
              letterSpacing="3.5"
            >
              POOLROOMS HORROR SURVIVAL
            </text>
          </svg>

          <p className="text-sm md:text-base text-[#a7bec4] leading-relaxed max-w-md">
            Cross 100 flooded subterranean pool halls before the clock runs out. Stay on
            unstable platforms — something vast is watching from beneath the surface.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onPlay(targetLevel.id)}
            className="px-7 py-3.5 rounded-lg bg-[#52e0b6] hover:bg-[#6ef0c8] text-[#071113] font-bold text-sm tracking-wider uppercase flex items-center justify-center gap-2.5 transition-colors shadow-lg cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            {targetLevel.id > 1 ? `Enter Sector ${targetLevel.id}` : 'Enter The Pool'}
          </button>

          <button
            type="button"
            onClick={onOpenMultiplayer}
            className="relative px-5 py-3.5 rounded-lg bg-[#112826] hover:bg-[#173633] border border-[#3d9c7e] text-[#8ef5d5] font-bold text-sm tracking-wider uppercase flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>Multiplayer</span>
            {multiplayerBadge > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-[#e29b29] text-[#071012] text-[10px] font-mono font-black leading-none">
                {multiplayerBadge}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenLevels}
            className="px-5 py-3.5 rounded-lg bg-[#111b1e]/90 hover:bg-[#19282c] border border-[#455a60] text-[#dce9ec] font-semibold text-sm tracking-wider uppercase flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Grid className="w-4 h-4" />
            Sectors (1–100)
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="px-5 py-3.5 rounded-lg bg-[#111b1e]/90 hover:bg-[#19282c] border border-[#455a60] text-[#dce9ec] font-semibold text-sm tracking-wider uppercase flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>
      </div>

      {/* Single flat control-hint line */}
      <div className="text-xs font-mono tracking-wider text-[#849da3]">
        WASD Move · Space Jump · Shift Run · Mouse Look · Esc Pause · Touch Joystick Supported
      </div>
    </div>
  );
};

/* ============================================================================
 * LEVEL SELECT MODAL
 * ==========================================================================*/
interface LevelSelectModalProps {
  saveData: SaveData;
  onSelect: (levelId: number) => void;
  onClose: () => void;
}

export const LevelSelectModal: React.FC<LevelSelectModalProps> = ({
  saveData,
  onSelect,
  onClose,
}) => {
  const diffColors: Record<LevelDef['difficulty'], string> = {
    Low: 'text-[#6ce0b8] border-[#6ce0b8]/40 bg-[#122e27]',
    Moderate: 'text-[#e8c668] border-[#e8c668]/40 bg-[#2b2612]',
    High: 'text-[#eb9054] border-[#eb9054]/40 bg-[#2e1d12]',
    Severe: 'text-[#ef6c6c] border-[#ef6c6c]/40 bg-[#301414]',
    Extreme: 'text-[#ff7096] border-[#ff7096]/40 bg-[#33111c]',
  };

  const { totalCleared, totalStars, frontierId } = useMemo(() => {
    let cleared = 0;
    let stars = 0;
    let frontier = 1;
    for (const lvl of LEVELS) {
      const rec = saveData[lvl.id];
      if (rec?.completed) {
        cleared++;
        stars += rec.stars || 0;
        if (lvl.id < LEVELS.length) frontier = lvl.id + 1;
        else frontier = lvl.id;
      } else if (isLevelUnlocked(lvl.id, saveData)) {
        frontier = lvl.id;
        break;
      }
    }
    return { totalCleared: cleared, totalStars: stars, frontierId: frontier };
  }, [saveData]);

  const [activeWing, setActiveWing] = useState<number>(() =>
    Math.min(SECTOR_WINGS.length - 1, Math.floor((frontierId - 1) / 10))
  );

  const currentWing = SECTOR_WINGS[activeWing] || SECTOR_WINGS[0];
  const wingLevels = useMemo(
    () => LEVELS.filter((l) => l.id >= currentWing.startId && l.id <= currentWing.endId),
    [currentWing]
  );

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-4 bg-[#060a0c]/88">
      <div className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-xl bg-[#0e1518] border border-[#314247] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-[#243236]">
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-wider uppercase text-[#e6f1f3]">
              Select Sector · 100 Subsurface Chambers
            </h2>
            <p className="text-xs font-mono text-[#7c969c]">
              {totalCleared} / 100 SECTORS CLEARED · {totalStars} / 300 STARS · CLEAR EACH SECTOR TO UNLOCK NEXT
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onSelect(frontierId)}
              className="hidden sm:inline-flex px-3.5 py-1.5 rounded-lg bg-[#52e0b6] hover:bg-[#6ef0c8] text-[#071113] font-bold text-xs uppercase tracking-wider cursor-pointer"
            >
              Play Sector {String(frontierId).padStart(2, '0')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-[#8fa7ad] hover:text-white hover:bg-[#1a262a] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 10 Facility Wing Selector Tabs */}
        <div className="px-4 sm:px-5 py-3 border-b border-[#202d31] bg-[#0a1012] flex gap-1.5 overflow-x-auto">
          {SECTOR_WINGS.map((w) => {
            const clearedInWing = LEVELS.filter(
              (l) => l.id >= w.startId && l.id <= w.endId && saveData[l.id]?.completed
            ).length;
            const wingUnlocked = isLevelUnlocked(w.startId, saveData);
            const isActive = activeWing === w.index;
            return (
              <button
                key={w.index}
                type="button"
                onClick={() => setActiveWing(w.index)}
                className={`shrink-0 px-3 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#15282c] border-[#52e0b6] text-[#e8faf5]'
                    : 'bg-[#10181b] border-[#26353a] text-[#8ba4aa] hover:bg-[#162125]'
                }`}
              >
                <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase">
                  <span>
                    {String(w.startId).padStart(2, '0')}–{String(w.endId).padStart(2, '0')}
                  </span>
                  {!wingUnlocked && <Lock className="w-2.5 h-2.5 text-[#6b7f85]" />}
                </div>
                <div className="text-xs font-bold whitespace-nowrap">
                  Wing {w.index + 1} · {clearedInWing}/10
                </div>
              </button>
            );
          })}
        </div>

        {/* Active Wing Banner */}
        <div className="px-5 sm:px-6 py-2.5 bg-[#0c1315] border-b border-[#1d282c] flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider" style={{ color: currentWing.accentHex }}>
              WING {String(currentWing.index + 1).padStart(2, '0')} · {currentWing.name}
            </div>
            <div className="text-xs text-[#8ba5ab]">{currentWing.subtitle}</div>
          </div>
          <span className="text-[11px] font-mono text-[#739096]">
            SECTORS {currentWing.startId}–{currentWing.endId}
          </span>
        </div>

        {/* 10 Sector Cards for Selected Wing */}
        <div className="p-4 sm:p-5 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-3">
          {wingLevels.map((lvl) => {
            const rec = saveData[lvl.id];
            const stars = rec?.stars || 0;
            const unlocked = isLevelUnlocked(lvl.id, saveData);
            return (
              <button
                key={lvl.id}
                type="button"
                disabled={!unlocked}
                onClick={() => unlocked && onSelect(lvl.id)}
                className={`text-left p-4 rounded-lg border transition-colors flex flex-col gap-2 group ${
                  unlocked
                    ? 'bg-[#131d20] hover:bg-[#1a282c] border-[#2a393e] hover:border-[#52e0b6]/70 cursor-pointer'
                    : 'bg-[#0c1214] border-[#1d272a] opacity-60 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono text-[#759aa3] flex items-center gap-1.5">
                    {!unlocked && <Lock className="w-3 h-3 text-[#82979d]" />}
                    {lvl.code}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase border ${diffColors[lvl.difficulty]}`}
                  >
                    {lvl.difficulty}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <h3
                    className={`text-base font-bold transition-colors ${
                      unlocked
                        ? 'text-[#e6f1f3] group-hover:text-[#6ef0c8]'
                        : 'text-[#8ba0a6]'
                    }`}
                  >
                    {lvl.name}
                  </h3>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {[1, 2, 3].map((s) => (
                      <Star
                        key={s}
                        className={`w-3.5 h-3.5 ${
                          s <= stars
                            ? 'text-[#f0c75e] fill-[#f0c75e]'
                            : 'text-[#314146]'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <p className="text-xs text-[#90a8ae] line-clamp-2">{lvl.subtitle}</p>

                <div className="flex items-center justify-between pt-1 border-t border-[#222f33] text-[11px] font-mono text-[#789298]">
                  <span>LIMIT: {lvl.timeLimit}s</span>
                  <span>
                    {!unlocked
                      ? `LOCKED · CLEAR SECTOR ${String(lvl.id - 1).padStart(2, '0')}`
                      : rec?.bestTime != null
                        ? `BEST: ${formatElapsed(rec.bestTime)}`
                        : 'UNLOCKED · NOT CLEARED'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * SETTINGS MODAL
 * ==========================================================================*/
interface SettingsModalProps {
  settings: GameSettings;
  showCustomizeControls?: boolean;
  onOpenCustomizeControls?: () => void;
  onChange: (next: GameSettings) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  showCustomizeControls = false,
  onOpenCustomizeControls,
  onChange,
  onClose,
}) => {
  const update = <K extends keyof GameSettings>(key: K, val: GameSettings[K]) => {
    onChange({ ...settings, [key]: val });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4 bg-[#060a0c]/88">
      <div className="w-full max-w-lg max-h-[92vh] flex flex-col rounded-xl bg-[#0e1518] border border-[#314247] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 sm:py-4 border-b border-[#243236] shrink-0">
          <h2 className="text-lg font-bold tracking-wider uppercase text-[#e6f1f3]">
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-[#8fa7ad] hover:text-white hover:bg-[#1a262a] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 flex flex-col gap-5 flex-1 min-h-0 overflow-y-auto">
          {/* Audio */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono tracking-wider text-[#88a4ab] uppercase">
                Audio
              </span>
              <button
                type="button"
                onClick={() => update('muted', !settings.muted)}
                className="px-3 py-1 rounded bg-[#152024] border border-[#34464c] text-xs font-mono text-[#d4e5e8] flex items-center gap-1.5 cursor-pointer"
              >
                {settings.muted ? <VolumeX className="w-3.5 h-3.5 text-[#e0746a]" /> : <Volume2 className="w-3.5 h-3.5" />}
                {settings.muted ? 'MUTED' : 'ACTIVE'}
              </button>
            </div>

            <label className="flex flex-col gap-1.5 text-xs text-[#b5c8cd]">
              <div className="flex justify-between font-mono">
                <span>Master Volume</span>
                <span>{Math.round(settings.masterVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.masterVolume}
                onChange={(e) => update('masterVolume', parseFloat(e.target.value))}
                className="horror-slider w-full"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs text-[#b5c8cd]">
              <div className="flex justify-between font-mono">
                <span>Music & Dread Ambience</span>
                <span>{Math.round(settings.musicVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.musicVolume}
                onChange={(e) => update('musicVolume', parseFloat(e.target.value))}
                className="horror-slider w-full"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs text-[#b5c8cd]">
              <div className="flex justify-between font-mono">
                <span>Sound Effects</span>
                <span>{Math.round(settings.sfxVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.sfxVolume}
                onChange={(e) => update('sfxVolume', parseFloat(e.target.value))}
                className="horror-slider w-full"
              />
            </label>
          </div>

          <div className="border-t border-[#202d31]" />

          {/* Voice Chat */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono tracking-wider text-[#88a4ab] uppercase">
                Voice Chat (Multiplayer)
              </span>
              <button
                type="button"
                onClick={() => update('voiceEnabled', !settings.voiceEnabled)}
                className={`px-3 py-1 rounded border text-xs font-mono cursor-pointer ${
                  settings.voiceEnabled
                    ? 'bg-[#52e0b6]/20 border-[#52e0b6] text-[#8ef5d5]'
                    : 'bg-[#152024] border-[#34464c] text-[#90a8ae]'
                }`}
              >
                {settings.voiceEnabled ? 'ON' : 'OFF'}
              </button>
            </div>

            <label className="flex flex-col gap-1.5 text-xs text-[#b5c8cd]">
              <div className="flex justify-between font-mono">
                <span>Voice Chat Volume</span>
                <span>{Math.round(settings.voiceVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.voiceVolume}
                onChange={(e) => update('voiceVolume', parseFloat(e.target.value))}
                className="horror-slider w-full"
              />
            </label>
          </div>

          <div className="border-t border-[#202d31]" />

          {/* Controls */}
          <div className="flex flex-col gap-3">
            <span className="text-xs font-mono tracking-wider text-[#88a4ab] uppercase">
              Camera & Touch
            </span>

            <label className="flex flex-col gap-1.5 text-xs text-[#b5c8cd]">
              <div className="flex justify-between font-mono">
                <span>Look Sensitivity</span>
                <span>{settings.mouseSensitivity.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min={0.3}
                max={2.4}
                step={0.1}
                value={settings.mouseSensitivity}
                onChange={(e) => update('mouseSensitivity', parseFloat(e.target.value))}
                className="horror-slider w-full"
              />
            </label>

            <div className="flex items-center justify-between text-xs text-[#b5c8cd]">
              <span className="font-mono">Invert Look Y-Axis</span>
              <button
                type="button"
                onClick={() => update('invertY', !settings.invertY)}
                className={`px-3 py-1 rounded border font-mono cursor-pointer ${
                  settings.invertY
                    ? 'bg-[#52e0b6]/20 border-[#52e0b6] text-[#8ef5d5]'
                    : 'bg-[#152024] border-[#34464c] text-[#90a8ae]'
                }`}
              >
                {settings.invertY ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="flex items-center justify-between text-xs text-[#b5c8cd]">
              <span className="font-mono">Mobile Touch Controls</span>
              <div className="flex gap-1">
                {(['auto', 'on', 'off'] as TouchControlsMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => update('touchControls', mode)}
                    className={`px-2.5 py-1 rounded border font-mono uppercase cursor-pointer ${
                      settings.touchControls === mode
                        ? 'bg-[#52e0b6]/20 border-[#52e0b6] text-[#8ef5d5]'
                        : 'bg-[#152024] border-[#34464c] text-[#90a8ae]'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {showCustomizeControls && onOpenCustomizeControls && (
              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-xs text-[#9cb5bb] font-mono">
                  Mobile Control Layout
                </span>
                <button
                  type="button"
                  onClick={onOpenCustomizeControls}
                  className="px-3.5 py-2 rounded-lg bg-[#142a2e] hover:bg-[#1b393e] border border-[#458a82] text-[#9cf7e3] font-mono font-bold text-xs tracking-wider uppercase flex items-center gap-1.5 cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  Customize Controls
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-[#202d31]" />

          {/* Graphics Quality */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono tracking-wider text-[#88a4ab] uppercase">
                Graphics Quality
              </span>
              <span className="text-[11px] font-mono text-[#6e8c94]">
                {settings.quality === 'auto'
                  ? 'Adaptive FPS scaling'
                  : settings.quality === 'smooth'
                    ? 'Max FPS · Low-end mobile'
                    : settings.quality === 'standard'
                      ? 'Balanced shadows & water'
                      : 'Full reflections & range'}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {(
                [
                  { id: 'auto', label: 'Auto' },
                  { id: 'smooth', label: 'Smooth' },
                  { id: 'standard', label: 'Standard' },
                  { id: 'ultra', label: 'Ultra' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => update('quality', opt.id)}
                  className={`py-2 rounded border font-mono text-xs uppercase cursor-pointer transition-colors ${
                    settings.quality === opt.id
                      ? 'bg-[#52e0b6]/20 border-[#52e0b6] text-[#8ef5d5]'
                      : 'bg-[#152024] border-[#34464c] text-[#90a8ae] hover:border-[#4b656d]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[#243236] flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-[#52e0b6] hover:bg-[#6ef0c8] text-[#071113] font-bold text-xs tracking-wider uppercase cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * PAUSE MODAL
 * ==========================================================================*/
interface PauseModalProps {
  levelCode: string;
  levelName: string;
  isMultiplayer?: boolean;
  onResume: () => void;
  onRestart: () => void;
  onSettings: () => void;
  onLevels: () => void;
  onQuitMenu: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  levelCode,
  levelName,
  isMultiplayer = false,
  onResume,
  onRestart,
  onSettings,
  onLevels,
  onQuitMenu,
}) => (
  <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#060a0c]/85">
    <div className="w-full max-w-sm rounded-xl bg-[#0e1518] border border-[#314247] p-6 flex flex-col gap-4 shadow-2xl">
      <div className="text-center">
        <div className="text-xs font-mono text-[#7a9aa2]">{levelCode}</div>
        <h2 className="text-xl font-bold tracking-wider uppercase text-[#e6f1f3]">
          Paused · {levelName}
        </h2>
      </div>

      <div className="flex flex-col gap-2.5 pt-2">
        <button
          type="button"
          onClick={onResume}
          className="w-full py-3 rounded-lg bg-[#52e0b6] hover:bg-[#6ef0c8] text-[#071113] font-bold text-sm tracking-wider uppercase cursor-pointer"
        >
          Resume
        </button>
        {!isMultiplayer && (
          <>
            <button
              type="button"
              onClick={onRestart}
              className="w-full py-2.5 rounded-lg bg-[#152125] hover:bg-[#1d2d32] border border-[#384b50] text-[#dce9ec] font-semibold text-sm tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Restart Sector
            </button>
            <button
              type="button"
              onClick={onLevels}
              className="w-full py-2.5 rounded-lg bg-[#152125] hover:bg-[#1d2d32] border border-[#384b50] text-[#dce9ec] font-semibold text-sm tracking-wider uppercase cursor-pointer"
            >
              Sector Select
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onSettings}
          className="w-full py-2.5 rounded-lg bg-[#152125] hover:bg-[#1d2d32] border border-[#384b50] text-[#dce9ec] font-semibold text-sm tracking-wider uppercase cursor-pointer"
        >
          Settings
        </button>
        <button
          type="button"
          onClick={onQuitMenu}
          className="w-full py-2.5 rounded-lg bg-transparent hover:bg-[#1c1516] border border-[#4a3235] text-[#e09d9d] font-semibold text-sm tracking-wider uppercase cursor-pointer"
        >
          {isMultiplayer ? 'Leave Match' : 'Main Menu'}
        </button>
      </div>
    </div>
  </div>
);

/* ============================================================================
 * GAME OVER MODAL
 * ==========================================================================*/
interface GameOverModalProps {
  reason: 'caught' | 'timeout';
  levelCode: string;
  levelName: string;
  hasCheckpoint: boolean;
  onRetry: () => void;
  onCheckpoint: () => void;
  onLevels: () => void;
  onMenu: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  reason,
  levelCode,
  levelName,
  hasCheckpoint,
  onRetry,
  onCheckpoint,
  onLevels,
  onMenu,
}) => (
  <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#120608]/90">
    <div className="w-full max-w-md rounded-xl bg-[#130c0e] border border-[#5e2930] p-7 flex flex-col gap-5 text-center shadow-2xl">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-mono tracking-[0.2em] text-[#cf6b73] uppercase">
          {levelCode} · {levelName}
        </span>
        <h2 className="text-3xl font-black tracking-wider uppercase text-[#ffe5e8]">
          {reason === 'timeout' ? 'TIME EXPIRED' : 'DRAGGED UNDER'}
        </h2>
        <p className="text-sm text-[#c4999e]">
          {reason === 'timeout'
            ? 'The sector bulkhead sealed before you reached the exit.'
            : 'The aquatic stalker caught you in the deep water.'}
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={onRetry}
          className="w-full py-3.5 rounded-lg bg-[#d94c57] hover:bg-[#eb5e69] text-white font-bold text-sm tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          Restart Sector
        </button>
        {hasCheckpoint && reason === 'caught' && (
          <button
            type="button"
            onClick={onCheckpoint}
            className="w-full py-2.5 rounded-lg bg-[#231618] hover:bg-[#321f22] border border-[#6e383f] text-[#ffdce0] font-semibold text-sm tracking-wider uppercase cursor-pointer"
          >
            Resume at Checkpoint
          </button>
        )}
        <button
          type="button"
          onClick={onLevels}
          className="w-full py-2.5 rounded-lg bg-[#1d1416] hover:bg-[#291b1e] border border-[#4a2c30] text-[#e8d5d7] font-semibold text-sm tracking-wider uppercase cursor-pointer"
        >
          Sector Select
        </button>
        <button
          type="button"
          onClick={onMenu}
          className="w-full py-2.5 rounded-lg bg-transparent hover:bg-[#1d1416] text-[#b0898d] font-semibold text-xs tracking-wider uppercase cursor-pointer"
        >
          Return to Main Menu
        </button>
      </div>
    </div>
  </div>
);

/* ============================================================================
 * VICTORY / LEVEL COMPLETE MODAL
 * ==========================================================================*/
interface VictoryModalProps {
  level: LevelDef;
  elapsed: number;
  hasNextLevel: boolean;
  onNextLevel: () => void;
  onReplay: () => void;
  onLevels: () => void;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  level,
  elapsed,
  hasNextLevel,
  onNextLevel,
  onReplay,
  onLevels,
}) => {
  const stars = computeStars(level, elapsed);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#060d0c]/88">
      <div className="w-full max-w-md rounded-xl bg-[#0d1716] border border-[#315c51] p-7 flex flex-col gap-5 text-center shadow-2xl">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-mono tracking-[0.2em] text-[#68d9b4] uppercase">
            {level.code} CLEARED
          </span>
          <h2 className="text-3xl font-black tracking-wider uppercase text-[#e8faf4]">
            {hasNextLevel ? 'SECTOR SURVIVED' : 'ESCAPED THE DEEP'}
          </h2>
          <p className="text-sm text-[#98bab0]">{level.name}</p>
        </div>

        {/* Star rating */}
        <div className="flex items-center justify-center gap-2 py-1">
          {[1, 2, 3].map((s) => (
            <Star
              key={s}
              className={`w-8 h-8 ${
                s <= stars ? 'text-[#f5ca5c] fill-[#f5ca5c]' : 'text-[#253b36]'
              }`}
            />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 p-3.5 rounded-lg bg-[#091210] border border-[#223d36] font-mono text-xs">
          <div className="flex flex-col gap-0.5">
            <span className="text-[#6f968b]">CLEAR TIME</span>
            <span className="text-lg font-bold text-[#e6faf3] tabular-nums">
              {formatElapsed(elapsed)}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[#6f968b]">3-STAR TARGET</span>
            <span className="text-lg font-bold text-[#89c4b3] tabular-nums">
              {formatElapsed(level.parTimes[0])}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          {hasNextLevel && (
            <button
              type="button"
              onClick={onNextLevel}
              className="w-full py-3.5 rounded-lg bg-[#52e0b6] hover:bg-[#6ef0c8] text-[#071113] font-bold text-sm tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer"
            >
              Next Sector
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onReplay}
            className="w-full py-2.5 rounded-lg bg-[#13221f] hover:bg-[#1b302c] border border-[#315249] text-[#d7ede6] font-semibold text-sm tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Replay for Faster Time
          </button>
          <button
            type="button"
            onClick={onLevels}
            className="w-full py-2.5 rounded-lg bg-transparent hover:bg-[#13221f] text-[#8eb3a7] font-semibold text-xs tracking-wider uppercase cursor-pointer"
          >
            Sector Select
          </button>
        </div>
      </div>
    </div>
  );
};
