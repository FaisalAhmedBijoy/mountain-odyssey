/** Every tunable gameplay number (spec §5). Change values here, not in systems. */
export const GAME_CONFIG = {
  physics: { stepHz: 60, maxStepsPerFrame: 5, gravity: -9.81 },
  player: {
    capsuleHalfHeight: 0.55,
    capsuleRadius: 0.3,
    heightM: 1.7,
    eyeHeight: 1.5,
    controllerOffsetM: 0.02,
    snapToGroundM: 0.3,
    autostepHeightM: 0.35,
    autostepMinWidthM: 0.2,
    feetNearGroundM: 0.15,
  },
  /** Character look (visual realism spec §6, phase B). */
  character: {
    /** Brightness of each toon shading step, darkest first (0–1). Two steps = soft look. */
    toonLevels: [0.62, 1],
    outline: {
      /** Half-thickness as a fraction of the viewport half-size. 0.003 is about 3 px at 1080p. */
      width: 0.003,
      /** Dark brown, not black. */
      color: 0x3b2a20,
    },
    /** Clip names tried in order for each role. The first one the model has is used. */
    clips: {
      idle: ['Idle'],
      walk: ['Walking', 'Walk'],
      run: ['Running', 'Run'],
      fall: ['Falling', 'Fall', 'Jump'],
      climb: ['Climbing', 'Climb', 'Walking', 'Walk'],
    },
  },
  movement: {
    walkSpeed: 3,
    runSpeed: 6,
    climbSpeed: 0.5,
    jumpVelocity: 4.5,
    airControl: 0.3,
    maxWalkSlopeDeg: 33,
    maxRunSlopeDeg: 20,
    minClimbSlopeDeg: 50,
    runMinStamina: 10,
    grabReachM: 0.9,
    climbHoldGapM: 0.1,
    mantleForwardM: 0.6,
    mantleMaxRiseM: 1.9,
    mantleMaxDropM: 1,
    mantleLiftM: 0.02,
    wallCorrectionMaxM: 0.05,
    wallRayRetryOffsetM: 0.013,
    groundedStickVelocity: -1,
    maxFallSpeed: 50,
    maxSlideSpeed: 15,
  },
  stamina: {
    max: 100,
    runDrainPerSec: 8,
    climbMoveDrainPerSec: 5,
    climbHoldDrainPerSec: 1.5,
    recoveryPerSec: 6,
    minCap: 10,
  },
  fall: { injuryHeightM: 6, fatalHeightM: 15, injuryCapPenalty: 30 },
  /** Survival stats (M2a spec §4). Every stat ranges 0..max. */
  survival: {
    max: 100,
    restSeconds: 3,
    respawnItemLossFraction: 0.2,
    startingPack: { food: 4, water: 4, o2: 2 },
    acclimatization: { perRestM: 250, maxM: 1000 },
    oxygen: {
      ceilingRefAltitudeM: 3000,
      ceilingMetresPerPoint: 40,
      minCeiling: 20,
      exertionDrainPerSec: 2,
      recoverPerSec: 1,
      dropToCeilingPerSec: 2,
      bottleAltitudeBonusM: 2000,
      bottleSeconds: 600,
      warnLow: 25,
      warnCritical: 10,
    },
    temperature: {
      seaLevelAirC: 25,
      lapseCPerKm: 6.5,
      comfortC: 10,
      windFactorPerMs: 0.1,
      insulation: 20,
      /** Clothing always worn; items add to it (M2b spec §3). */
      baseInsulation: 6,
      /** Shelter heat of a tent rest away from a camp. */
      tentShelterHeat: 15,
      /** Added to the shelter heat of any rest when a stove is packed. */
      stoveHeat: 10,
      activityHeat: { idle: 0, walk: 3, exert: 6 },
      campShelterHeat: 30,
      rateDivisor: 60,
      slowClimbBelow: 30,
      coldClimbSpeedMul: 0.7,
      warnCold: 40,
      warnHypothermia: 15,
    },
    supplies: {
      drainPerSec: 1 / 30,
      foodGain: 25,
      waterGain: 15,
      emptyStaminaCap: 50,
      emptyRecoveryMul: 0.5,
      warnLow: 20,
      restCost: 10,
      respawnMin: 30,
    },
  },
  /** Items the player can pack (M2b spec §3). weightKg is per unit. */
  items: {
    boots: {
      name: 'Mountaineering boots',
      kind: 'gear',
      weightKg: 2,
      maxCount: 1,
      insulation: 0,
      effect: 'Required on every mountain',
    },
    crampons: {
      name: 'Crampons',
      kind: 'gear',
      weightKg: 1,
      maxCount: 1,
      insulation: 0,
      effect: 'Climb ice (with an ice axe)',
    },
    iceAxe: {
      name: 'Ice axe',
      kind: 'gear',
      weightKg: 0.7,
      maxCount: 1,
      insulation: 0,
      effect: 'Climb snow and ice',
    },
    harness: {
      name: 'Harness',
      kind: 'gear',
      weightKg: 0.5,
      maxCount: 1,
      insulation: 0,
      effect: 'For fixed ropes (coming later)',
    },
    ascender: {
      name: 'Ascender',
      kind: 'gear',
      weightKg: 0.3,
      maxCount: 1,
      insulation: 0,
      effect: 'For fixed ropes (coming later)',
    },
    jacket: {
      name: 'Insulated jacket',
      kind: 'gear',
      weightKg: 1.5,
      maxCount: 1,
      insulation: 12,
      effect: 'Warmth +12',
    },
    gloves: {
      name: 'Gloves',
      kind: 'gear',
      weightKg: 0.3,
      maxCount: 1,
      insulation: 4,
      effect: 'Warmth +4; climb below −15 °C',
    },
    tent: {
      name: 'Tent',
      kind: 'gear',
      weightKg: 3,
      maxCount: 1,
      insulation: 0,
      effect: 'Rest anywhere (R)',
    },
    stove: {
      name: 'Stove',
      kind: 'gear',
      weightKg: 1.5,
      maxCount: 1,
      insulation: 0,
      effect: 'Warmer rests',
    },
    food: {
      name: 'Food ration',
      kind: 'stack',
      weightKg: 0.6,
      maxCount: 8,
      insulation: 0,
      effect: '+25 supplies (F)',
    },
    water: {
      name: 'Water',
      kind: 'stack',
      weightKg: 1,
      maxCount: 8,
      insulation: 0,
      effect: '+15 supplies (F)',
    },
    o2: {
      name: 'O₂ bottle',
      kind: 'stack',
      weightKg: 3.5,
      maxCount: 4,
      insulation: 0,
      effect: '10 min of bottled oxygen (O)',
    },
  },
  /** Pack weight and gear rules (M2b spec §3). */
  equipment: {
    /** Sleeping bag, clothes and first aid: always carried, not shown as an item. */
    basePackKg: 6,
    /** Below this air temperature, climbing needs gloves. */
    glovesMinAirTempC: -15,
    weight: { freeKg: 20, speedLossPerKg: 0.02, staminaCostPerKg: 0.03, minSpeedMul: 0.5 },
  },
  surface: { rockMinSlopeDeg: 40, snowlineM: 5300, iceMinAltitudeM: 5400, iceMinSlopeDeg: 25 },
  checkpoints: { radiusM: 15, maxHeightDiffM: 10 },
  camera: {
    fovDeg: 60,
    near: 0.2,
    far: 8000,
    minDistance: 2,
    maxDistance: 8,
    defaultDistance: 3,
    distanceSteps: [2.2, 3, 5],
    minPitchDeg: -30,
    maxPitchDeg: 70,
    defaultPitchDeg: 15,
    followSharpness: 10,
    mouseSensitivity: 0.0025,
    wheelSensitivity: 0.005,
    collisionPaddingM: 0.4,
    climbExtraDistance: 1.5,
    climbSideOffset: 0.8,
    /** Look-target shift to the player's right while not climbing (m). Puts the character left of centre. */
    shoulderOffsetM: 0.55,
    shake: {
      enabled: true,
      /** Trauma (0–1) lost per second. */
      decayPerSec: 1.6,
      frequencyHz: 9,
      maxPitchDeg: 2.2,
      maxYawDeg: 1.6,
      maxRollDeg: 2.5,
      /** Landing drops below this add no trauma; at landFullDropM they add landMaxTrauma. */
      landMinDropM: 0.6,
      landFullDropM: 6,
      landMaxTrauma: 0.9,
      /** Run bob: steps per second, vertical amplitude (m), roll amplitude (deg), blend speed. */
      runBobHz: 2.6,
      runBobHeightM: 0.035,
      runBobRollDeg: 0.35,
      runBobSharpness: 8,
    },
  },
  terrain: {
    lodRings: [
      { maxRing: 0, step: 1 },
      { maxRing: 1, step: 2 },
      { maxRing: 2, step: 8 },
      { maxRing: 3, step: 32 },
    ],
    skirtDepthM: 20,
    /** Respawn when the feet drop this far below the lowest baked height. */
    outOfWorldDropM: 50,
    /** Satellite imagery blend (visual realism spec §6). */
    imagery: {
      /** Share of the biome palette colour mixed over the image right at the camera (0–1). */
      paletteMix: 0.4,
      /** The palette share falls to 0 between these distances from the camera (m). */
      fadeStartM: 120,
      fadeEndM: 900,
    },
  },
  world: {
    sunDirection: [0.4, 0.8, 0.3],
    /** Warm sun, cool sky fill, warm ground bounce. */
    sun: { color: 0xffe2b8, intensity: 2.6 },
    hemisphere: { skyColor: 0xdfeeff, groundColor: 0x6b5a48, intensity: 1.0 },
    sky: {
      /** Dome radius (m). Must stay below camera.far. */
      domeRadiusM: 7000,
      /** Below 1: the horizon colour reaches higher up the sky. */
      gradientExponent: 0.6,
    },
    clouds: {
      seed: 4107,
      count: 26,
      /** Clouds repeat inside a square of this half-size around the player (m). */
      radiusM: 5000,
      /** Cloud base above the highest terrain point (m), and layer thickness (m). */
      baseAboveMaxM: 350,
      thicknessM: 250,
      puffsMin: 4,
      puffsMax: 8,
      puffSizeMinM: 350,
      puffSizeMaxM: 800,
      /** How far puffs of one cloud spread sideways (m). */
      spreadM: 500,
      /** Drift in m/s along x and z. */
      windX: 4,
      windZ: 1.5,
      color: 0xffffff,
      opacity: 0.85,
    },
  },
  /** Per-mountain looks (Keokradong spec §3). Gameplay rules stay global. */
  biomes: {
    himalaya: {
      palette: { kind: 'surface' },
      sky: { color: 0xa9c4dd, zenithColor: 0x4f86c6, fogNear: 800, fogFar: 7000 },
      vegetation: [],
    },
    'tropical-hills': {
      palette: {
        kind: 'slope',
        /** sRGB; the first band whose maxSlopeDeg exceeds the slope wins. */
        bands: [
          { maxSlopeDeg: 15, color: [0.36, 0.55, 0.24] },
          { maxSlopeDeg: 35, color: [0.17, 0.36, 0.16] },
          { maxSlopeDeg: 90, color: [0.55, 0.33, 0.2] },
        ],
      },
      sky: { color: 0xc4d6cf, zenithColor: 0x6fa3d8, fogNear: 300, fogFar: 3500 },
      vegetation: [
        {
          kind: 'trees',
          seed: 986,
          spacingM: 7,
          density: 0.35,
          maxSlopeDeg: 40,
          routeClearanceM: 4,
          campClearanceM: 20,
          ringRadius: 1,
          minScale: 0.8,
          maxScale: 1.4,
          castShadow: false,
        },
      ],
    },
    'tea-garden': {
      palette: {
        kind: 'slope',
        /** sRGB: lawn, tea, forest, laterite soil. */
        bands: [
          { maxSlopeDeg: 3, color: [0.47, 0.62, 0.3] },
          { maxSlopeDeg: 20, color: [0.3, 0.55, 0.2] },
          { maxSlopeDeg: 35, color: [0.15, 0.33, 0.14] },
          { maxSlopeDeg: 90, color: [0.58, 0.36, 0.22] },
        ],
        stripes: { bandIndex: 1, riseM: 3, contrast: 0.25, maxVertexSpacingM: 4 },
      },
      sky: { color: 0xd9e6dc, zenithColor: 0x7fb0dc, fogNear: 400, fogFar: 4500 },
      vegetation: [
        {
          kind: 'trees',
          seed: 2351,
          spacingM: 7,
          density: 0.45,
          minSlopeDeg: 20,
          maxSlopeDeg: 40,
          routeClearanceM: 4,
          campClearanceM: 20,
          ringRadius: 1,
          minScale: 0.8,
          maxScale: 1.4,
          castShadow: false,
        },
        {
          kind: 'trees',
          seed: 2352,
          spacingM: 18,
          density: 0.25,
          minSlopeDeg: 3,
          maxSlopeDeg: 20,
          variants: [1],
          routeClearanceM: 4,
          campClearanceM: 20,
          ringRadius: 1,
          minScale: 1.1,
          maxScale: 1.6,
          castShadow: false,
        },
        {
          kind: 'tea',
          stepM: 2,
          minSlopeDeg: 3,
          maxSlopeDeg: 20,
          riseM: 0.8,
          bandFraction: 0.35,
          routeClearanceM: 4,
          campClearanceM: 20,
          radiusM: 190,
          cellSizeM: 64,
          maxCellsPerUpdate: 2,
          castShadow: false,
        },
      ],
    },
  },
  hud: { publishIntervalMs: 100, toastMs: 3000 },
  guide: {
    ribbonWidthM: 1.2,
    ribbonLiftM: 0.3,
    ribbonVertexSpacingM: 2,
    ribbonColor: 0xff8a1f,
    ribbonOpacity: 0.75,
    aheadM: 400,
    behindM: 50,
    windowStepM: 10,
    lookAheadM: 30,
    offRouteThresholdM: 40,
    markerPoleHeightM: 2,
    markerPoleColor: 0x8b6b3d,
    markerFlagColor: 0xd7263d,
  },
  /** Map (map spec §3–5). */
  map: { routeSpacingM: 40, minimapSpanM: 1200 },
} as const;

export type BiomeId = keyof typeof GAME_CONFIG.biomes;

export const isBiomeId = (v: string): v is BiomeId => Object.hasOwn(GAME_CONFIG.biomes, v);
