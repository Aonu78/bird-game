import React, { useEffect, useRef, useState, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  Volume2,
  VolumeX,
  RotateCcw,
  Download,
  Smartphone,
  Trophy,
  Play,
  Pause,
  Maximize2,
  Info,
  CheckCircle2,
  Terminal,
  Zap,
} from 'lucide-react';

// Game Constants matching the native Android Java code
const VIRTUAL_WIDTH = 1920;
const VIRTUAL_HEIGHT = 1080;

const RELATIVE_X_AVATAR = 0.2; // 384
const RELATIVE_Y_AVATAR = 0.15; // 162
const DRAWABLE_RADIUS_AVATAR = 60;
const PHYSICS_RADIUS_AVATAR = 55;

const OBSTACLE_WIDTH = 120;
const OBSTACLE_SPACE_BETWEEN = 350;
const OBSTACLE_FREE_HEIGHT = 360;
const OBSTACLE_FROM = 150;
const OBSTACLE_TO = 1080 - 150;

type GameState = 'START' | 'PLAYING' | 'GAMEOVER' | 'PAUSED';
type Difficulty = 'classic' | 'fast' | 'relaxed';

interface Obstacle {
  id: number;
  x: number;
  topHeight: number;
  gapY: number;
  gapHeight: number;
  passed: boolean;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // App & Game State
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(() => {
    return parseInt(localStorage.getItem('birdgame_highscore') || '0', 10);
  });
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [difficulty, setDifficulty] = useState<Difficulty>('classic');
  const [showAndroidModal, setShowAndroidModal] = useState<boolean>(false);
  const [copiedAdb, setCopiedAdb] = useState<boolean>(false);

  // Audio Context synthesizer for reliable native-like audio
  const audioCtxRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const playSound = useCallback((type: 'flap' | 'score' | 'hit' | 'over') => {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      if (type === 'flap') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(560, now + 0.12);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.13);
      } else if (type === 'score') {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, now); // D5
        osc1.frequency.setValueAtTime(880, now + 0.08); // A5
        osc2.frequency.setValueAtTime(880, now);
        osc2.frequency.setValueAtTime(1174.66, now + 0.08); // D6
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.3);
        osc2.stop(now + 0.3);
      } else if (type === 'hit') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.18);
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.19);
      } else if (type === 'over') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(330, now);
        osc.frequency.linearRampToValueAtTime(220, now + 0.15);
        osc.frequency.linearRampToValueAtTime(150, now + 0.35);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.38);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.4);
      }
    } catch {
      // Audio playback suppressed safely
    }
  }, [soundEnabled, getAudioContext]);

  // Game internal mutable state
  const gameStateRef = useRef<GameState>('START');
  gameStateRef.current = gameState;

  const scoreRef = useRef<number>(0);
  const avatarRef = useRef({
    x: VIRTUAL_WIDTH * RELATIVE_X_AVATAR,
    y: VIRTUAL_HEIGHT * RELATIVE_Y_AVATAR,
    vy: 0,
    angle: 0,
    frame: 1,
    isFlapping: false,
    flapUntil: 0,
  });

  const obstaclesRef = useRef<Obstacle[]>([]);
  const cameraXRef = useRef<number>(0);
  const nextObstacleIdRef = useRef<number>(1);
  const lastTimeRef = useRef<number>(performance.now());
  const animationFrameIdRef = useRef<number>(0);

  // Asset image refs
  const avatarImgRef = useRef<HTMLImageElement | null>(null);
  const obstacleImgRef = useRef<HTMLImageElement | null>(null);
  const obstaclePatternRef = useRef<CanvasPattern | null>(null);

  // Difficulty multipliers
  const getSpeedMultiplier = useCallback(() => {
    if (difficulty === 'fast') return 1.45;
    if (difficulty === 'relaxed') return 0.9;
    return 1.2; // Classic fast factor (1.2 in GameScreen.java)
  }, [difficulty]);

  // Preload images
  useEffect(() => {
    const avImg = new Image();
    avImg.src = '/avatar.png';
    avImg.onload = () => {
      avatarImgRef.current = avImg;
    };

    const obsImg = new Image();
    obsImg.src = '/obstacle.png';
    obsImg.onload = () => {
      obstacleImgRef.current = obsImg;
    };
  }, []);

  // Helper to spawn obstacles ahead
  const spawnObstaclesIfNeeded = useCallback((camX: number) => {
    const lastObs = obstaclesRef.current[obstaclesRef.current.length - 1];
    let startX = lastObs ? lastObs.x + OBSTACLE_WIDTH + OBSTACLE_SPACE_BETWEEN : VIRTUAL_WIDTH * 0.7;

    while (startX < camX + VIRTUAL_WIDTH * 1.5) {
      const gapEntrance = Math.floor(
        Math.random() * (OBSTACLE_TO - OBSTACLE_FROM - OBSTACLE_FREE_HEIGHT) + OBSTACLE_FROM
      );
      obstaclesRef.current.push({
        id: nextObstacleIdRef.current++,
        x: startX,
        topHeight: gapEntrance,
        gapY: gapEntrance,
        gapHeight: OBSTACLE_FREE_HEIGHT,
        passed: false,
      });
      startX += OBSTACLE_WIDTH + OBSTACLE_SPACE_BETWEEN;
    }

    // Clean up passed obstacles that scrolled offscreen
    obstaclesRef.current = obstaclesRef.current.filter(
      (obs) => obs.x + OBSTACLE_WIDTH > camX - 200
    );
  }, []);

  // Reset Game
  const resetGame = useCallback(() => {
    scoreRef.current = 0;
    setScore(0);
    avatarRef.current = {
      x: VIRTUAL_WIDTH * RELATIVE_X_AVATAR,
      y: VIRTUAL_HEIGHT * RELATIVE_Y_AVATAR,
      vy: 0,
      angle: 0,
      frame: 1,
      isFlapping: false,
      flapUntil: 0,
    };
    cameraXRef.current = 0;
    obstaclesRef.current = [];
    nextObstacleIdRef.current = 1;
    spawnObstaclesIfNeeded(0);
    setGameState('PLAYING');
    lastTimeRef.current = performance.now();
  }, [spawnObstaclesIfNeeded]);

  // Jump action (Space / Tap / Click)
  const handleJump = useCallback(() => {
    getAudioContext(); // Resume audio on user action
    const current = gameStateRef.current;

    if (current === 'START') {
      resetGame();
      playSound('flap');
      return;
    }

    if (current === 'GAMEOVER') {
      resetGame();
      playSound('flap');
      return;
    }

    if (current === 'PLAYING') {
      // LiquidFun jump physics imitation
      const speedMult = getSpeedMultiplier();
      avatarRef.current.vy = -720 * speedMult;
      avatarRef.current.isFlapping = true;
      avatarRef.current.flapUntil = performance.now() + 250;
      playSound('flap');
    }
  }, [getAudioContext, resetGame, playSound, getSpeedMultiplier]);

  // Keyboard controls
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.key === ' ') {
        e.preventDefault();
        handleJump();
      } else if (e.code === 'KeyP') {
        if (gameStateRef.current === 'PLAYING') {
          setGameState('PAUSED');
        } else if (gameStateRef.current === 'PAUSED') {
          setGameState('PLAYING');
          lastTimeRef.current = performance.now();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleJump]);

  // Main Game Loop
  useEffect(() => {
    let animId = 0;

    const loop = (timestamp: number) => {
      const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = timestamp;

      const canvas = canvasRef.current;
      if (!canvas) {
        animId = requestAnimationFrame(loop);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animId = requestAnimationFrame(loop);
        return;
      }

      // Create obstacle pattern once ready
      if (!obstaclePatternRef.current && obstacleImgRef.current && obstacleImgRef.current.complete) {
        obstaclePatternRef.current = ctx.createPattern(obstacleImgRef.current, 'repeat');
      }

      const currentState = gameStateRef.current;
      const speedMult = getSpeedMultiplier();

      if (currentState === 'PLAYING') {
        // 1. Advance Physics
        const worldSpeed = 380 * speedMult;
        avatarRef.current.x += worldSpeed * dt;
        cameraXRef.current = avatarRef.current.x - VIRTUAL_WIDTH * RELATIVE_X_AVATAR;

        // Gravity
        const gravity = 1950 * speedMult;
        avatarRef.current.vy += gravity * dt;
        avatarRef.current.y += avatarRef.current.vy * dt;

        // Flapping animation
        const now = performance.now();
        if (now < avatarRef.current.flapUntil) {
          avatarRef.current.frame = (Math.floor(now / 70) % 2) as 0 | 1;
          avatarRef.current.angle = -0.38; // Tilt up during jump
        } else {
          avatarRef.current.frame = 1;
          // Smoothly dive when falling
          const targetAngle = Math.min(Math.PI / 2.8, (avatarRef.current.vy / 800) * 0.9);
          avatarRef.current.angle += (targetAngle - avatarRef.current.angle) * 0.12;
        }

        // 2. Obstacles Update & Spawning
        spawnObstaclesIfNeeded(cameraXRef.current);

        // Check scoring & collisions
        const avX = avatarRef.current.x;
        const avY = avatarRef.current.y;
        const avR = PHYSICS_RADIUS_AVATAR;

        // Boundary checks (ceiling & floor)
        if (avY - avR <= 0 || avY + avR >= VIRTUAL_HEIGHT - 60) {
          // Collision with floor or ceiling
          playSound('hit');
          setTimeout(() => playSound('over'), 120);
          setGameState('GAMEOVER');
          return;
        }

        for (const obs of obstaclesRef.current) {
          // Score update
          if (!obs.passed && avX > obs.x + OBSTACLE_WIDTH) {
            obs.passed = true;
            scoreRef.current += 1;
            setScore(scoreRef.current);
            playSound('score');

            // High score check
            if (scoreRef.current > highScore) {
              setHighScore(scoreRef.current);
              localStorage.setItem('birdgame_highscore', scoreRef.current.toString());
              if (scoreRef.current === highScore + 1 && scoreRef.current > 3) {
                confetti({
                  particleCount: 40,
                  spread: 60,
                  origin: { y: 0.6 },
                });
              }
            }
          }

          // Collision check with top obstacle rectangle
          const inObsX = avX + avR > obs.x && avX - avR < obs.x + OBSTACLE_WIDTH;
          if (inObsX) {
            // Check top obstacle
            if (avY - avR < obs.topHeight) {
              playSound('hit');
              setTimeout(() => playSound('over'), 120);
              setGameState('GAMEOVER');
              return;
            }
            // Check bottom obstacle
            const bottomObsTop = obs.gapY + obs.gapHeight;
            if (avY + avR > bottomObsTop) {
              playSound('hit');
              setTimeout(() => playSound('over'), 120);
              setGameState('GAMEOVER');
              return;
            }
          }
        }
      }

      // 3. Render Canvas (1920x1080 virtual resolution)
      ctx.save();

      // Background Gradient matching Android app (#E8FFFF to #A8D5F4)
      const grad = ctx.createLinearGradient(0, 0, 0, VIRTUAL_HEIGHT);
      grad.addColorStop(0, '#E8FFFF');
      grad.addColorStop(0.7, '#CBE8FA');
      grad.addColorStop(1, '#A8D5F4');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);

      // Cloud & mountain parallax subtle background
      const camX = cameraXRef.current;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      for (let i = -1; i < 6; i++) {
        const cloudX = ((i * 500 - (camX * 0.15)) % (VIRTUAL_WIDTH + 500) + VIRTUAL_WIDTH + 500) % (VIRTUAL_WIDTH + 500) - 200;
        ctx.beginPath();
        ctx.arc(cloudX, 180 + (i % 3) * 60, 90, 0, Math.PI * 2);
        ctx.arc(cloudX + 70, 150 + (i % 3) * 60, 110, 0, Math.PI * 2);
        ctx.arc(cloudX + 150, 180 + (i % 3) * 60, 80, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw Obstacles
      for (const obs of obstaclesRef.current) {
        const drawX = obs.x - camX;
        if (drawX + OBSTACLE_WIDTH < -50 || drawX > VIRTUAL_WIDTH + 50) continue;

        // Top Obstacle
        drawObstaclePillar(ctx, drawX, 0, OBSTACLE_WIDTH, obs.topHeight, 'top');

        // Bottom Obstacle
        const bottomY = obs.gapY + obs.gapHeight;
        const bottomH = VIRTUAL_HEIGHT - 60 - bottomY;
        drawObstaclePillar(ctx, drawX, bottomY, OBSTACLE_WIDTH, bottomH, 'bottom');
      }

      // Ground Bar (with grass and dirt texture)
      const groundY = VIRTUAL_HEIGHT - 60;
      ctx.fillStyle = '#65a30d'; // Grass green
      ctx.fillRect(0, groundY, VIRTUAL_WIDTH, 14);

      ctx.fillStyle = '#78350f'; // Ground brown
      ctx.fillRect(0, groundY + 14, VIRTUAL_WIDTH, 46);

      // Grass fringe accents
      ctx.fillStyle = '#4d7c0f';
      for (let gx = 0; gx < VIRTUAL_WIDTH; gx += 40) {
        const scrollOffset = (camX % 40);
        ctx.beginPath();
        ctx.moveTo(gx - scrollOffset, groundY + 14);
        ctx.lineTo(gx - scrollOffset + 20, groundY + 22);
        ctx.lineTo(gx - scrollOffset + 40, groundY + 14);
        ctx.fill();
      }

      // Draw Bird / Avatar
      const birdScreenX = avatarRef.current.x - camX;
      const birdScreenY = avatarRef.current.y;
      const angle = avatarRef.current.angle;

      ctx.save();
      ctx.translate(birdScreenX, birdScreenY);
      ctx.rotate(angle);

      // Draw from avatar.png sprite if loaded
      const avImg = avatarImgRef.current;
      if (avImg && avImg.complete && avImg.naturalWidth > 0) {
        const frame = avatarRef.current.frame; // 0 or 1
        const srcX = frame * 170;
        const srcY = 0;
        const srcW = 170;
        const srcH = 170;
        const drawR = DRAWABLE_RADIUS_AVATAR * 1.5;

        ctx.drawImage(avImg, srcX, srcY, srcW, srcH, -drawR, -drawR, drawR * 2, drawR * 2);
      } else {
        // Fallback procedural bird
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(0, 0, DRAWABLE_RADIUS_AVATAR, 0, Math.PI * 2);
        ctx.fill();

        // Eye
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(28, -16, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(34, -16, 8, 0, Math.PI * 2);
        ctx.fill();

        // Beak
        ctx.fillStyle = '#ea580c';
        ctx.beginPath();
        ctx.moveTo(40, -5);
        ctx.lineTo(70, 5);
        ctx.lineTo(40, 15);
        ctx.closePath();
        ctx.fill();

        // Wing
        ctx.fillStyle = '#d97706';
        ctx.beginPath();
        ctx.ellipse(-15, 8, 26, 16, Math.PI / 6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      // Top Right Score HUD (matches Android `R.string.score + score`)
      ctx.font = 'bold 54px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      ctx.fillText(`SCORE: ${scoreRef.current}`, VIRTUAL_WIDTH - 80, 100);

      // Best Score indicator
      ctx.font = 'bold 32px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
      ctx.fillText(`BEST: ${highScore}`, VIRTUAL_WIDTH - 80, 146);

      // State Overlays inside Canvas
      if (currentState === 'START') {
        drawOverlay(ctx, 'BIRD GAME', 'TAP OR PRESS SPACE TO START', '#1e293b');
      } else if (currentState === 'GAMEOVER') {
        // Original Android string: "HAI PERSO" (Game Over)
        drawGameOverOverlay(ctx, scoreRef.current, highScore);
      } else if (currentState === 'PAUSED') {
        drawOverlay(ctx, 'PAUSED', 'PRESS P OR CLICK TO RESUME', '#0f172a');
      }

      ctx.restore();
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    animationFrameIdRef.current = animId;

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [getSpeedMultiplier, spawnObstaclesIfNeeded, highScore, playSound]);

  // Helper to draw obstacle pillar with texture / styling
  const drawObstaclePillar = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    type: 'top' | 'bottom'
  ) => {
    if (h <= 0) return;

    ctx.save();
    // Use obstacle pattern if available, or rich shaded column
    if (obstaclePatternRef.current) {
      ctx.fillStyle = obstaclePatternRef.current;
      ctx.fillRect(x, y, w, h);
    } else {
      // Shaded green pipe
      const pipeGrad = ctx.createLinearGradient(x, 0, x + w, 0);
      pipeGrad.addColorStop(0, '#15803d');
      pipeGrad.addColorStop(0.3, '#4ade80');
      pipeGrad.addColorStop(0.7, '#22c55e');
      pipeGrad.addColorStop(1, '#166534');
      ctx.fillStyle = pipeGrad;
      ctx.fillRect(x, y, w, h);
    }

    // Border
    ctx.strokeStyle = '#14532d';
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);

    // Pipe Cap Accent (flange)
    const capHeight = 36;
    const capOverhang = 8;
    const capX = x - capOverhang;
    const capW = w + capOverhang * 2;
    const capY = type === 'top' ? y + h - capHeight : y;

    const capGrad = ctx.createLinearGradient(capX, 0, capX + capW, 0);
    capGrad.addColorStop(0, '#166534');
    capGrad.addColorStop(0.25, '#86efac');
    capGrad.addColorStop(0.65, '#22c55e');
    capGrad.addColorStop(1, '#14532d');
    ctx.fillStyle = capGrad;
    ctx.fillRect(capX, capY, capW, capHeight);

    ctx.strokeStyle = '#052e16';
    ctx.lineWidth = 4;
    ctx.strokeRect(capX, capY, capW, capHeight);

    ctx.restore();
  };

  // Canvas Overlay helpers
  const drawOverlay = (
    ctx: CanvasRenderingContext2D,
    title: string,
    subtitle: string,
    titleColor: string
  ) => {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.roundRect(VIRTUAL_WIDTH / 2 - 450, VIRTUAL_HEIGHT / 2 - 190, 900, 380, 32);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.font = 'bold 84px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(title, VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2 - 40);

    ctx.font = '600 36px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(subtitle, VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2 + 50);

    ctx.font = '400 28px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('CLICK, TAP OR PRESS SPACE TO FLAP', VIRTUAL_WIDTH / 2, VIRTUAL_HEIGHT / 2 + 115);
    ctx.restore();
  };

  const drawGameOverOverlay = (
    ctx: CanvasRenderingContext2D,
    finalScore: number,
    bestScore: number
  ) => {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);

    const boxW = 860;
    const boxH = 460;
    const boxX = (VIRTUAL_WIDTH - boxW) / 2;
    const boxY = (VIRTUAL_HEIGHT - boxH) / 2;

    ctx.fillStyle = '#0f172a';
    ctx.roundRect(boxX, boxY, boxW, boxH, 32);
    ctx.fill();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.textAlign = 'center';

    // Original Italian line from GameScreen.java line 129: "HAI PERSO"
    ctx.font = 'bold 76px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#ef4444';
    ctx.fillText('HAI PERSO! (GAME OVER)', VIRTUAL_WIDTH / 2, boxY + 110);

    ctx.font = '600 48px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(`SCORE: ${finalScore}    |    BEST: ${bestScore}`, VIRTUAL_WIDTH / 2, boxY + 210);

    ctx.font = '500 34px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('TAP OR PRESS SPACE TO RETRY', VIRTUAL_WIDTH / 2, boxY + 310);

    ctx.font = '400 26px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Or download the native Android APK below', VIRTUAL_WIDTH / 2, boxY + 375);

    ctx.restore();
  };

  const toggleFullscreen = () => {
    const el = document.getElementById('game-container');
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const copyAdbCommand = () => {
    navigator.clipboard.writeText('adb install app/build/outputs/apk/debug/app-debug.apk');
    setCopiedAdb(true);
    setTimeout(() => setCopiedAdb(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center">
      {/* Top Header */}
      <header className="w-full max-w-6xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center overflow-hidden shadow-inner">
            <img src="/avatar.png" alt="Bird Logo" className="w-8 h-8 object-contain" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg text-white tracking-wide">Bird Game</h1>
              <span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Android & Web
              </span>
            </div>
            <p className="text-xs text-slate-400">LiquidFun 2D Physics Endless Game</p>
          </div>
        </div>

        {/* Controls & Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Difficulty selector */}
          <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700 text-xs">
            {(['relaxed', 'classic', 'fast'] as Difficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`px-2.5 py-1 rounded-md font-medium capitalize transition-colors ${
                  difficulty === d
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          {/* Sound Toggle */}
          <button
            onClick={() => setSoundEnabled((prev) => !prev)}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            title={soundEnabled ? 'Mute audio' : 'Unmute audio'}
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} className="text-red-400" />}
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            title="Toggle Fullscreen"
          >
            <Maximize2 size={18} />
          </button>

          {/* Android Info Modal Trigger */}
          <button
            onClick={() => setShowAndroidModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition"
          >
            <Smartphone size={16} className="text-emerald-400" />
            <span>Android Details</span>
          </button>

          {/* Direct APK Download Button */}
          <a
            href="/app-debug.apk"
            download="birdgame-debug.apk"
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium text-xs shadow-md shadow-emerald-950/40 border border-emerald-400/30 transition transform active:scale-95"
          >
            <Download size={15} />
            <span>Download APK (6.6MB)</span>
          </a>
        </div>
      </header>

      {/* Main Game Container */}
      <main className="w-full max-w-5xl px-4 py-4 flex flex-col items-center">
        {/* Game Screen Canvas with 16:9 Aspect Ratio */}
        <div
          id="game-container"
          className="relative w-full aspect-video max-h-[72vh] rounded-2xl overflow-hidden shadow-2xl border-2 border-slate-800 bg-sky-100 flex items-center justify-center cursor-pointer select-none"
          onClick={handleJump}
        >
          <canvas
            ref={canvasRef}
            width={VIRTUAL_WIDTH}
            height={VIRTUAL_HEIGHT}
            className="w-full h-full object-contain block"
          />

          {/* Mobile Tap Cue */}
          {gameState === 'PLAYING' && (
            <div className="absolute bottom-3 left-4 pointer-events-none text-slate-900/60 text-xs font-semibold uppercase tracking-wider backdrop-blur-sm bg-white/40 px-2.5 py-1 rounded-full">
              Tap / Click / Spacebar to Flap
            </div>
          )}
        </div>

        {/* Quick HUD below canvas */}
        <div className="w-full mt-3 flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 rounded-xl p-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-slate-400 font-medium">Score</span>
              <span className="text-xl font-bold text-sky-400 font-mono">{score}</span>
            </div>
            <div className="h-4 w-px bg-slate-700" />
            <div className="flex items-center gap-2">
              <Trophy size={16} className="text-amber-400" />
              <span className="text-xs uppercase tracking-wider text-slate-400 font-medium">High Score</span>
              <span className="text-lg font-bold text-amber-400 font-mono">{highScore}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {gameState === 'PLAYING' ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setGameState('PAUSED');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
              >
                <Pause size={14} />
                <span>Pause</span>
              </button>
            ) : gameState === 'PAUSED' ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setGameState('PLAYING');
                  lastTimeRef.current = performance.now();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition"
              >
                <Play size={14} />
                <span>Resume</span>
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  resetGame();
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition shadow-sm"
              >
                <RotateCcw size={14} />
                <span>Restart</span>
              </button>
            )}
          </div>
        </div>

        {/* Android Build Status & Download Card */}
        <div className="w-full mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 size={18} className="text-emerald-400" />
                <h3 className="font-semibold text-sm text-slate-200">Android APK Ready</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Compiled with Gradle 9.3.1, AGP 9.1.1, Java 21, and Android SDK 36.
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-slate-400 font-mono">app-debug.apk</span>
              <span className="text-emerald-400 font-semibold font-mono">6.6 MB</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Zap size={18} className="text-sky-400" />
                <h3 className="font-semibold text-sm text-slate-200">Physics & Engine</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Native Box2D LiquidFun physics engine with arm64-v8a, x86_64, and armeabi-v7a native libraries.
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-slate-400">Architecture</span>
              <span className="text-sky-400 font-medium">Java + JNI C++</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Terminal size={18} className="text-amber-400" />
                <h3 className="font-semibold text-sm text-slate-200">ADB Install Command</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Deploy directly to any connected Android device or emulator.
              </p>
            </div>
            <button
              onClick={copyAdbCommand}
              className="mt-3 w-full py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-mono text-slate-300 flex items-center justify-between transition"
            >
              <span className="truncate">adb install app-debug.apk</span>
              <span className="text-[10px] text-sky-400 uppercase font-sans font-semibold ml-2 shrink-0">
                {copiedAdb ? 'Copied!' : 'Copy'}
              </span>
            </button>
          </div>
        </div>
      </main>

      {/* Android Details Modal */}
      {showAndroidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Smartphone size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Native Android Build</h3>
                  <p className="text-xs text-slate-400">Package: mirkoalicastro.com.birdgame</p>
                </div>
              </div>
              <button
                onClick={() => setShowAndroidModal(false)}
                className="text-slate-400 hover:text-white text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-sm text-slate-300">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs space-y-1.5 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Output APK:</span>
                  <span className="text-slate-300">app/build/outputs/apk/debug/app-debug.apk</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">File Size:</span>
                  <span className="text-emerald-400 font-semibold">6.68 MB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Compile SDK:</span>
                  <span className="text-slate-300">36 (Android 16)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Min SDK:</span>
                  <span className="text-slate-300">24 (Android 7.0)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">AGP Version:</span>
                  <span className="text-slate-300">9.1.1 (Gradle 9.3.1)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Signing:</span>
                  <span className="text-slate-300">debug.keystore (androiddebugkey)</span>
                </div>
              </div>

              <h4 className="font-semibold text-slate-200 text-xs uppercase tracking-wider mt-4">
                How to install on Android device:
              </h4>
              <ol className="list-decimal list-inside text-xs text-slate-400 space-y-1 pl-1">
                <li>Click <strong>Download APK</strong> to save <code className="text-emerald-300 font-mono">app-debug.apk</code> to your device.</li>
                <li>Tap the downloaded file on your phone and allow installation from unknown sources.</li>
                <li>Or connect your phone via USB and run <code className="text-sky-300 font-mono">adb install app-debug.apk</code> in a terminal.</li>
              </ol>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowAndroidModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
              >
                Close
              </button>
              <a
                href="/app-debug.apk"
                download="birdgame-debug.apk"
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition shadow-md"
              >
                <Download size={14} />
                <span>Download APK</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
