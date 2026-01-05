import { onMount, onCleanup, createSignal, createEffect, For, Show } from 'solid-js'
import * as THREE from 'three'
import './App.css'

// Game constants
const G = 8 // Gravitational constant (very gentle)
const LAUNCH_POWER_MULTIPLIER = 0.5 // Strong launches
const GRAVITY_SOFTENING = 10 // Prevents extreme forces at close range
const MAX_TRAIL_LENGTH = 100
const GOAL_RADIUS = 2.5

interface Planet {
  mesh: THREE.Mesh
  position: THREE.Vector3
  mass: number
  radius: number
  color: number
  glow: THREE.Mesh
}

interface Level {
  name: string
  description: string
  spacecraft: { x: number; y: number }
  goal: { x: number; y: number }
  planets: { x: number; y: number; mass: number; radius: number; color: number }[]
  hint?: string
}

const LEVELS: Level[] = [
  {
    name: "First Launch",
    description: "Learn the basics - aim and launch towards the portal!",
    spacecraft: { x: -20, y: 0 },
    goal: { x: 20, y: 0 },
    planets: [],
    hint: "Click and drag to aim, release to launch!"
  },
  {
    name: "Gentle Curve",
    description: "Experience how gravity bends your path",
    spacecraft: { x: -25, y: 0 },
    goal: { x: 25, y: 0 },
    planets: [
      { x: 0, y: -12, mass: 400, radius: 2.5, color: 0x4a90d9 }
    ],
    hint: "Aim straight - watch how the planet gently pulls you"
  },
  {
    name: "Slingshot",
    description: "Use gravity to change your direction",
    spacecraft: { x: -25, y: -10 },
    goal: { x: 25, y: 10 },
    planets: [
      { x: 0, y: -5, mass: 600, radius: 3, color: 0xd94a4a }
    ],
    hint: "Fly past the planet to curve toward the goal"
  },
  {
    name: "Twin Stars",
    description: "Navigate between two gravitational fields",
    spacecraft: { x: -30, y: 0 },
    goal: { x: 30, y: 0 },
    planets: [
      { x: 0, y: 15, mass: 400, radius: 2, color: 0xffa500 },
      { x: 0, y: -15, mass: 400, radius: 2, color: 0x9932cc }
    ],
    hint: "Fly through the middle - the pulls cancel out!"
  },
  {
    name: "Orbital Assist",
    description: "Use multiple gravity assists to reach the goal",
    spacecraft: { x: -30, y: -15 },
    goal: { x: 30, y: 15 },
    planets: [
      { x: -10, y: 10, mass: 350, radius: 2, color: 0x808080 },
      { x: 10, y: -5, mass: 400, radius: 2, color: 0x4a90d9 }
    ],
    hint: "Let the planets guide your path"
  },
  {
    name: "The Gauntlet",
    description: "Navigate through the asteroid field",
    spacecraft: { x: -35, y: 0 },
    goal: { x: 35, y: 0 },
    planets: [
      { x: -15, y: 8, mass: 300, radius: 1.5, color: 0xff6b6b },
      { x: -15, y: -8, mass: 300, radius: 1.5, color: 0x6bff6b },
      { x: 0, y: 12, mass: 350, radius: 1.8, color: 0xffd700 },
      { x: 0, y: -12, mass: 350, radius: 1.8, color: 0x6b6bff },
      { x: 15, y: 6, mass: 300, radius: 1.5, color: 0xff6bff },
      { x: 15, y: -6, mass: 300, radius: 1.5, color: 0x6bffff }
    ],
    hint: "Find the path with the gentlest curves"
  },
  {
    name: "Black Hole",
    description: "Careful! Don't get too close to the black hole",
    spacecraft: { x: -30, y: 20 },
    goal: { x: 30, y: 20 },
    planets: [
      { x: 0, y: 0, mass: 1500, radius: 4, color: 0x1a1a2e }
    ],
    hint: "Stay far from the center - its pull is strong!"
  }
]

function App() {
  let containerRef: HTMLDivElement | undefined
  
  const [currentLevel, setCurrentLevel] = createSignal(0)
  const [gameState, setGameState] = createSignal<'aiming' | 'flying' | 'success' | 'failed'>('aiming')
  const [attempts, setAttempts] = createSignal(0)
  const [showMenu, setShowMenu] = createSignal(true)
  const [showLevelSelect, setShowLevelSelect] = createSignal(false)
  const [isDragging, setIsDragging] = createSignal(false)
  const [launchPower, setLaunchPower] = createSignal(0)
  const [launchAngle, setLaunchAngle] = createSignal(0)
  const [showHint, setShowHint] = createSignal(false)
  const [completedLevels, setCompletedLevels] = createSignal<Set<number>>(new Set())
  const [retryCounter, setRetryCounter] = createSignal(0) // Used to force level reinitialization

  onMount(() => {
    if (!containerRef) return

    // Scene setup
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x050510)

    // Camera (orthographic for 2D-like view with depth)
    const frustumSize = 50
    const aspect = window.innerWidth / window.innerHeight
    const camera = new THREE.OrthographicCamera(
      -frustumSize * aspect, frustumSize * aspect,
      frustumSize, -frustumSize,
      0.1, 1000
    )
    camera.position.z = 50

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    containerRef.appendChild(renderer.domElement)

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(10, 20, 30)
    scene.add(directionalLight)

    // Stars background
    const starsGeometry = new THREE.BufferGeometry()
    const starsCount = 1000
    const starsPositions = new Float32Array(starsCount * 3)
    const starsSizes = new Float32Array(starsCount)

    for (let i = 0; i < starsCount * 3; i += 3) {
      starsPositions[i] = (Math.random() - 0.5) * 200
      starsPositions[i + 1] = (Math.random() - 0.5) * 150
      starsPositions[i + 2] = -20 + Math.random() * -30
      starsSizes[i / 3] = Math.random() * 2
    }

    starsGeometry.setAttribute('position', new THREE.BufferAttribute(starsPositions, 3))
    starsGeometry.setAttribute('size', new THREE.BufferAttribute(starsSizes, 1))

    const starsMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.3,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    })

    const stars = new THREE.Points(starsGeometry, starsMaterial)
    scene.add(stars)

    // Game objects
    let spacecraft: THREE.Group
    let spacecraftVelocity = new THREE.Vector3()
    let planets: Planet[] = []
    let goal: THREE.Group
    let aimLine: THREE.Line
    let trajectoryLine: THREE.Line
    let trail: THREE.Line
    let trailPositions: THREE.Vector3[] = []

    // Create spacecraft
    function createSpacecraft() {
      const group = new THREE.Group()

      // Main body
      const bodyGeometry = new THREE.ConeGeometry(0.8, 2.5, 8)
      const bodyMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x00ffaa,
        metalness: 0.6,
        roughness: 0.3,
        emissive: 0x00ffaa,
        emissiveIntensity: 0.3
      })
      const body = new THREE.Mesh(bodyGeometry, bodyMaterial)
      body.rotation.z = -Math.PI / 2
      group.add(body)

      // Engine glow
      const engineGeometry = new THREE.SphereGeometry(0.5, 16, 16)
      const engineMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.8
      })
      const engine = new THREE.Mesh(engineGeometry, engineMaterial)
      engine.position.x = -1.2
      engine.scale.x = 1.5
      group.add(engine)

      // Wings
      const wingGeometry = new THREE.BoxGeometry(0.8, 0.1, 2)
      const wingMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x008866,
        metalness: 0.7,
        roughness: 0.2
      })
      const wing = new THREE.Mesh(wingGeometry, wingMaterial)
      wing.position.x = -0.5
      group.add(wing)

      return group
    }

    // Create planet with glow
    function createPlanet(planetData: Level['planets'][0]): Planet {
      const geometry = new THREE.SphereGeometry(planetData.radius, 32, 32)
      const material = new THREE.MeshPhysicalMaterial({
        color: planetData.color,
        metalness: 0.2,
        roughness: 0.7,
        emissive: planetData.color,
        emissiveIntensity: 0.15
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(planetData.x, planetData.y, 0)

      // Glow effect
      const glowGeometry = new THREE.SphereGeometry(planetData.radius * 1.5, 32, 32)
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: planetData.color,
        transparent: true,
        opacity: 0.15,
        side: THREE.BackSide
      })
      const glow = new THREE.Mesh(glowGeometry, glowMaterial)
      glow.position.copy(mesh.position)

      scene.add(mesh)
      scene.add(glow)

      return {
        mesh,
        position: new THREE.Vector3(planetData.x, planetData.y, 0),
        mass: planetData.mass,
        radius: planetData.radius,
        color: planetData.color,
        glow
      }
    }

    // Create goal portal
    function createGoal(x: number, y: number) {
      const group = new THREE.Group()
      group.position.set(x, y, 0)

      // Outer ring
      const ringGeometry = new THREE.TorusGeometry(GOAL_RADIUS, 0.3, 16, 32)
      const ringMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xffd700,
        metalness: 0.8,
        roughness: 0.2,
        emissive: 0xffd700,
        emissiveIntensity: 0.5
      })
      const ring = new THREE.Mesh(ringGeometry, ringMaterial)
      group.add(ring)

      // Inner glow
      const glowGeometry = new THREE.CircleGeometry(GOAL_RADIUS * 0.8, 32)
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.3
      })
      const innerGlow = new THREE.Mesh(glowGeometry, glowMaterial)
      innerGlow.position.z = 0.1
      group.add(innerGlow)

      // Outer glow
      const outerGlowGeometry = new THREE.RingGeometry(GOAL_RADIUS, GOAL_RADIUS * 2, 32)
      const outerGlowMaterial = new THREE.MeshBasicMaterial({
        color: 0xffd700,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide
      })
      const outerGlow = new THREE.Mesh(outerGlowGeometry, outerGlowMaterial)
      group.add(outerGlow)

      return group
    }

    // Create aim line
    function createAimLine() {
      const geometry = new THREE.BufferGeometry()
      const positions = new Float32Array(6)
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      
      const material = new THREE.LineBasicMaterial({
        color: 0x00ffaa,
        transparent: true,
        opacity: 0.8
      })

      return new THREE.Line(geometry, material)
    }

    // Create trajectory prediction line
    function createTrajectoryLine() {
      const geometry = new THREE.BufferGeometry()
      const positions = new Float32Array(300 * 3) // 100 points
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      
      const material = new THREE.LineDashedMaterial({
        color: 0x00ffaa,
        transparent: true,
        opacity: 0.4,
        dashSize: 1,
        gapSize: 0.5
      })

      const line = new THREE.Line(geometry, material)
      line.computeLineDistances()
      return line
    }

    // Create trail line
    function createTrailLine() {
      const geometry = new THREE.BufferGeometry()
      const positions = new Float32Array(MAX_TRAIL_LENGTH * 3)
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      
      const material = new THREE.LineBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.6
      })

      return new THREE.Line(geometry, material)
    }

    // Predict trajectory
    function predictTrajectory(startPos: THREE.Vector3, velocity: THREE.Vector3, steps: number): THREE.Vector3[] {
      const positions: THREE.Vector3[] = []
      const pos = startPos.clone()
      const vel = velocity.clone()
      const dt = 0.016 * 3 // Larger timestep for prediction

      for (let i = 0; i < steps; i++) {
        // Calculate gravitational forces
        const acceleration = new THREE.Vector3()
        let collision = false

        for (const planet of planets) {
          const direction = planet.position.clone().sub(pos)
          const distance = direction.length()

          if (distance < planet.radius) {
            collision = true
            break
          }

          // Soft gravity: linear falloff with softening to prevent extreme forces
          const softDistance = distance + GRAVITY_SOFTENING
          const force = G * planet.mass / (softDistance * softDistance)
          direction.normalize().multiplyScalar(force)
          acceleration.add(direction)
        }

        if (collision) break

        // Check if reached goal
        if (goal && pos.distanceTo(goal.position) < GOAL_RADIUS * 1.5) break

        vel.add(acceleration.multiplyScalar(dt))
        pos.add(vel.clone().multiplyScalar(dt))
        positions.push(pos.clone())

        // Check bounds
        if (Math.abs(pos.x) > 60 || Math.abs(pos.y) > 50) break
      }

      return positions
    }

    // Update trajectory line
    function updateTrajectoryLine(startPos: THREE.Vector3, velocity: THREE.Vector3) {
      const positions = predictTrajectory(startPos, velocity, 100)
      const positionArray = trajectoryLine.geometry.attributes.position.array as Float32Array

      for (let i = 0; i < 100; i++) {
        if (i < positions.length) {
          positionArray[i * 3] = positions[i].x
          positionArray[i * 3 + 1] = positions[i].y
          positionArray[i * 3 + 2] = 0
        } else {
          positionArray[i * 3] = 0
          positionArray[i * 3 + 1] = 0
          positionArray[i * 3 + 2] = 0
        }
      }

      trajectoryLine.geometry.attributes.position.needsUpdate = true
      trajectoryLine.geometry.setDrawRange(0, positions.length)
      trajectoryLine.computeLineDistances()
    }

    // Initialize level
    function initLevel(levelIndex: number) {
      const level = LEVELS[levelIndex]

      // Clear previous objects
      planets.forEach(p => {
        scene.remove(p.mesh)
        scene.remove(p.glow)
      })
      planets = []

      if (spacecraft) scene.remove(spacecraft)
      if (goal) scene.remove(goal)
      if (aimLine) scene.remove(aimLine)
      if (trajectoryLine) scene.remove(trajectoryLine)
      if (trail) scene.remove(trail)

      // Create spacecraft
      spacecraft = createSpacecraft()
      spacecraft.position.set(level.spacecraft.x, level.spacecraft.y, 0)
      scene.add(spacecraft)

      // Create planets
      level.planets.forEach(planetData => {
        planets.push(createPlanet(planetData))
      })

      // Create goal
      goal = createGoal(level.goal.x, level.goal.y)
      scene.add(goal)

      // Create lines
      aimLine = createAimLine()
      scene.add(aimLine)

      trajectoryLine = createTrajectoryLine()
      scene.add(trajectoryLine)

      trail = createTrailLine()
      scene.add(trail)
      trailPositions = []

      // Reset state
      spacecraftVelocity.set(0, 0, 0)
      setGameState('aiming')
      setAttempts(a => a + 1)
    }

    // Mouse interaction
    const mouse = new THREE.Vector2()

    function getMouseWorldPos(event: MouseEvent): THREE.Vector3 {
      const rect = renderer.domElement.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      
      const vector = new THREE.Vector3(mouse.x, mouse.y, 0)
      vector.unproject(camera)
      return vector
    }

    function onMouseDown(_event: MouseEvent) {
      if (showMenu() || showLevelSelect() || gameState() !== 'aiming') return
      
      // Start dragging for slingshot effect
      setIsDragging(true)
      
      // Show aim lines
      aimLine.visible = true
      trajectoryLine.visible = true
    }

    function onMouseMove(event: MouseEvent) {
      if (!isDragging() || gameState() !== 'aiming') return

      const worldPos = getMouseWorldPos(event)
      
      // Calculate direction from mouse to spacecraft (slingshot pulls back)
      const dx = spacecraft.position.x - worldPos.x
      const dy = spacecraft.position.y - worldPos.y
      const power = Math.min(Math.sqrt(dx * dx + dy * dy), 30)
      const angle = Math.atan2(dy, dx)

      setLaunchPower(power)
      setLaunchAngle(angle)

      // Update aim line (shows launch direction)
      const aimPositions = aimLine.geometry.attributes.position.array as Float32Array
      aimPositions[0] = spacecraft.position.x
      aimPositions[1] = spacecraft.position.y
      aimPositions[2] = 0
      aimPositions[3] = spacecraft.position.x + Math.cos(angle) * power * 0.5
      aimPositions[4] = spacecraft.position.y + Math.sin(angle) * power * 0.5
      aimPositions[5] = 0
      aimLine.geometry.attributes.position.needsUpdate = true

      // Update spacecraft rotation to face launch direction
      spacecraft.rotation.z = angle

      // Update trajectory prediction
      const velocity = new THREE.Vector3(
        Math.cos(angle) * power * LAUNCH_POWER_MULTIPLIER,
        Math.sin(angle) * power * LAUNCH_POWER_MULTIPLIER,
        0
      )
      updateTrajectoryLine(spacecraft.position.clone(), velocity)
    }

    function onMouseUp() {
      if (!isDragging() || gameState() !== 'aiming') return
      
      setIsDragging(false)

      if (launchPower() > 2) {
        // Launch!
        spacecraftVelocity.set(
          Math.cos(launchAngle()) * launchPower() * LAUNCH_POWER_MULTIPLIER,
          Math.sin(launchAngle()) * launchPower() * LAUNCH_POWER_MULTIPLIER,
          0
        )
        setGameState('flying')

        // Hide aim lines
        aimLine.visible = false
        trajectoryLine.visible = false
      } else {
        // Cancel - hide lines
        aimLine.visible = false
        trajectoryLine.visible = false
      }

      setLaunchPower(0)
    }

    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    // Handle resize
    function onResize() {
      const aspect = window.innerWidth / window.innerHeight
      camera.left = -frustumSize * aspect
      camera.right = frustumSize * aspect
      camera.top = frustumSize
      camera.bottom = -frustumSize
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', onResize)

    // Animation
    let time = 0
    function animate() {
      requestAnimationFrame(animate)
      time += 0.016

      // Animate stars
      stars.rotation.z = time * 0.01

      // Animate goal
      if (goal) {
        goal.rotation.z = time * 0.5
        goal.children.forEach((child, i) => {
          if (i === 1) { // Inner glow
            const mesh = child as THREE.Mesh;
            (mesh.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(time * 3) * 0.1
          }
        })
      }

      // Animate planets
      planets.forEach((planet, i) => {
        planet.mesh.rotation.y = time * 0.2 * (i % 2 === 0 ? 1 : -1);
        (planet.glow.material as THREE.MeshBasicMaterial).opacity = 0.15 + Math.sin(time * 2 + i) * 0.05;
      })

      // Physics update when flying
      if (gameState() === 'flying' && spacecraft) {
        const dt = 0.016

        // Calculate gravitational forces
        const acceleration = new THREE.Vector3()
        let crashed = false

        for (const planet of planets) {
          const direction = planet.position.clone().sub(spacecraft.position)
          const distance = direction.length()

          // Check collision
          if (distance < planet.radius + 0.5) {
            crashed = true
            break
          }

          // Soft gravity: linear falloff with softening to prevent extreme forces
          const softDistance = distance + GRAVITY_SOFTENING
          const force = G * planet.mass / (softDistance * softDistance)
          direction.normalize().multiplyScalar(force)
          acceleration.add(direction)
        }

        if (crashed) {
          setGameState('failed')
        } else {
          // Update velocity and position
          spacecraftVelocity.add(acceleration.multiplyScalar(dt))
          spacecraft.position.add(spacecraftVelocity.clone().multiplyScalar(dt))

          // Update spacecraft rotation to face direction of travel
          if (spacecraftVelocity.length() > 0.1) {
            spacecraft.rotation.z = Math.atan2(spacecraftVelocity.y, spacecraftVelocity.x)
          }

          // Update trail
          trailPositions.push(spacecraft.position.clone())
          if (trailPositions.length > MAX_TRAIL_LENGTH) {
            trailPositions.shift()
          }

          const trailArray = trail.geometry.attributes.position.array as Float32Array
          for (let i = 0; i < MAX_TRAIL_LENGTH; i++) {
            if (i < trailPositions.length) {
              trailArray[i * 3] = trailPositions[i].x
              trailArray[i * 3 + 1] = trailPositions[i].y
              trailArray[i * 3 + 2] = 0
            }
          }
          trail.geometry.attributes.position.needsUpdate = true
          trail.geometry.setDrawRange(0, trailPositions.length)

          // Check if reached goal
          if (goal && spacecraft.position.distanceTo(goal.position) < GOAL_RADIUS * 1.2) {
            setGameState('success')
            setCompletedLevels(prev => {
              const newSet = new Set(prev)
              newSet.add(currentLevel())
              return newSet
            })
          }

          // Check if out of bounds
          if (Math.abs(spacecraft.position.x) > 55 || Math.abs(spacecraft.position.y) > 45) {
            setGameState('failed')
          }
        }
      }

      // Engine glow animation
      if (spacecraft && gameState() === 'flying') {
        const engine = spacecraft.children[1] as THREE.Mesh;
        engine.scale.x = 1.5 + Math.sin(time * 20) * 0.3;
        (engine.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(time * 15) * 0.2;
      }

      renderer.render(scene, camera)
    }

    // Start animation
    animate()

    // Level reactivity - tracks both currentLevel and retryCounter
    createEffect(() => {
      const level = currentLevel()
      const _retry = retryCounter() // Track retry counter to trigger on retry
      if (!showMenu() && !showLevelSelect()) {
        initLevel(level)
      }
    })

    onCleanup(() => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('resize', onResize)
      containerRef?.removeChild(renderer.domElement)
      renderer.dispose()
    })
  })

  function startGame() {
    setShowMenu(false)
    setCurrentLevel(0)
    setAttempts(0)
  }

  function nextLevel() {
    if (currentLevel() < LEVELS.length - 1) {
      setCurrentLevel(c => c + 1)
    } else {
      // Game complete - return to menu
      setGameState('aiming')
      setShowMenu(true)
    }
  }

  function retryLevel() {
    setRetryCounter(c => c + 1) // Increment to trigger createEffect
  }

  function openLevelSelect() {
    setShowLevelSelect(true)
    setShowMenu(false)
  }

  function selectLevel(index: number) {
    setShowLevelSelect(false)
    setCurrentLevel(index)
    setAttempts(0)
  }

  return (
    <div class="game-container">
      <div ref={containerRef} class="canvas-container" />
      
      {/* Main Menu */}
      <Show when={showMenu()}>
        <div class="menu-overlay">
          <div class="menu-content">
            <h1 class="game-title">
              <span class="title-icon">🚀</span>
              <span class="title-text">Orbital Escape</span>
            </h1>
            <p class="game-subtitle">A Space Physics Puzzle</p>
            
            <div class="menu-buttons">
              <button class="menu-btn primary" onClick={startGame}>
                <span class="btn-icon">▶</span>
                Start Game
              </button>
              <button class="menu-btn" onClick={openLevelSelect}>
                <span class="btn-icon">📋</span>
                Level Select
              </button>
            </div>

            <div class="menu-instructions">
              <h3>How to Play</h3>
              <ul>
                <li>🎯 Click and drag on your spacecraft to aim</li>
                <li>🚀 Release to launch</li>
                <li>🌍 Use planetary gravity to curve your path</li>
                <li>✨ Reach the golden portal to complete each level</li>
              </ul>
            </div>
          </div>
        </div>
      </Show>

      {/* Level Select */}
      <Show when={showLevelSelect()}>
        <div class="menu-overlay">
          <div class="level-select-content">
            <h2 class="level-select-title">Select Level</h2>
            <div class="level-grid">
              <For each={LEVELS}>
                {(level, index) => (
                  <button 
                    class={`level-card ${completedLevels().has(index()) ? 'completed' : ''}`}
                    onClick={() => selectLevel(index())}
                  >
                    <span class="level-number">{index() + 1}</span>
                    <span class="level-name">{level.name}</span>
                    <Show when={completedLevels().has(index())}>
                      <span class="level-check">✓</span>
                    </Show>
                  </button>
                )}
              </For>
            </div>
            <button class="menu-btn back-btn" onClick={() => { setShowLevelSelect(false); setShowMenu(true); }}>
              ← Back to Menu
            </button>
          </div>
        </div>
      </Show>

      {/* Game UI */}
      <Show when={!showMenu() && !showLevelSelect()}>
        <div class="game-ui">
          <div class="level-info">
            <div class="level-header">
              <span class="level-badge">Level {currentLevel() + 1}</span>
              <span class="level-title">{LEVELS[currentLevel()].name}</span>
            </div>
            <p class="level-description">{LEVELS[currentLevel()].description}</p>
          </div>

          <div class="game-stats">
            <div class="stat">
              <span class="stat-label">Attempts</span>
              <span class="stat-value">{attempts()}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Completed</span>
              <span class="stat-value">{completedLevels().size}/{LEVELS.length}</span>
            </div>
          </div>

          <Show when={gameState() === 'aiming'}>
            <div class="aim-indicator">
              <Show when={launchPower() > 0}>
                <div class="power-bar">
                  <div class="power-fill" style={{ width: `${(launchPower() / 30) * 100}%` }} />
                </div>
              </Show>
              <p class="aim-hint">
                {launchPower() > 0 
                  ? `Power: ${Math.round((launchPower() / 30) * 100)}%`
                  : 'Click and drag on spaceship to aim'}
              </p>
            </div>
          </Show>

          <Show when={LEVELS[currentLevel()].hint}>
            <button class="hint-btn" onClick={() => setShowHint(!showHint())}>
              💡 {showHint() ? 'Hide' : 'Show'} Hint
            </button>
            <Show when={showHint()}>
              <div class="hint-box">{LEVELS[currentLevel()].hint}</div>
            </Show>
          </Show>

          <div class="game-controls">
            <button class="control-btn" onClick={() => setShowMenu(true)}>
              🏠 Menu
            </button>
            <button class="control-btn" onClick={retryLevel}>
              🔄 Retry
            </button>
          </div>
        </div>
      </Show>

      {/* Success Modal */}
      <Show when={gameState() === 'success'}>
        <div class="modal-overlay">
          <div class="modal success-modal">
            <div class="success-icon">🎉</div>
            <h2>Level Complete!</h2>
            <p>You escaped in {attempts()} attempt{attempts() > 1 ? 's' : ''}!</p>
            <div class="modal-buttons">
              <button class="modal-btn" onClick={retryLevel}>
                🔄 Retry
              </button>
              <button class="modal-btn primary" onClick={nextLevel}>
                {currentLevel() < LEVELS.length - 1 ? '➡️ Next Level' : '🏆 Complete!'}
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* Failed Modal */}
      <Show when={gameState() === 'failed'}>
        <div class="modal-overlay">
          <div class="modal failed-modal">
            <div class="failed-icon">💥</div>
            <h2>Mission Failed</h2>
            <p>Your spacecraft was lost in space!</p>
            <div class="modal-buttons">
              <button class="modal-btn primary" onClick={retryLevel}>
                🔄 Try Again
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}

export default App
