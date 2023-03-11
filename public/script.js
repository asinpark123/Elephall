// Have fun coding! :D
const socket = io();

let isPointerDown = false;
let intervalId = null;
const initialState = {
  count: {
    ele: 0,
    mouse: 0,
  },
  renderedCount: {
    ele: 0,
    mouse: 0,
  },
  connectedUsers: 0,
  scale: 1,
  queued: [],
  queuedForces: [],
}

let state = JSON.parse(JSON.stringify(initialState))

const dimensions = {
  width: 1080,
  height: 1920,
}

const SceneA = new Phaser.Class({

  Extends: Phaser.Scene,

  initialize: function SceneA() {
    Phaser.Scene.call(this, { key: 'sceneA' });
    this.gravityX = 0;
    this.gravityY = 0.9;
  },

  preload: function() {
    this.load.image('ele', 'ele.png');
    this.load.image('mouse', 'mouse.png');
    this.load.image('orb', 'orb.png');
    this.load.image('fire', 'explosion.png');
  },

  onDeviceOrientation: function(event) {
    // extract the rotation data from the event
    const { alpha, beta, gamma } = event;

    // calculate the new gravity values based on the device's orientation
    this.gravityX = beta / 90;
    this.gravityY = gamma / 90;
    console.log(this.gravityX, this.gravityY)
    // this.coords.setText(`Orientation: ${this.gravityX}, ${this.gravityY}`);
  },

  startDeviceOrientationListener: function() {
    window.addEventListener('deviceorientation', this.onDeviceOrientation.bind(this), true);
  },

  stopDeviceOrientationListener: function() {
    window.removeEventListener('deviceorientation', this.onDeviceOrientation.bind(this), true);
  },

  createExplosionForce: function(x, y) {
    const bodies = this.matter.world.localWorld.bodies;
    const explosionForce = 10 * Math.pow(state.scale, 3);
    const radius = 1000;

    for (const body of bodies) {
      const pos = { x: body.position.x, y: body.position.y }
      const distance = Phaser.Math.Distance.Between(x, y, pos.x, pos.y);
      if (distance < radius) {
        const angle = Phaser.Math.Angle.Between(x, y, pos.x, pos.y);
        // const force = { x: Math.cos(angle), y: Math.sin(angle) };
        this.matter.applyForceFromPosition(body, pos, explosionForce, angle);
      }
    }
  },

  beforeUpdate: function() {
    while (state.queuedForces.length > 0) {
      const forceLocation = state.queuedForces.pop();
      this.createExplosionForce(forceLocation.x, forceLocation.y);
    }
    // console.log('before update');
  },

  addAnimal: function(animal, pos = { x: Phaser.Math.Between(100, dimensions.width - 100), y: Phaser.Math.Between(-dimensions.height / 2, 0) }) {
    const nextAnimal = this.matter.add.image(pos.x, pos.y, animal);
    nextAnimal.setCircle();
    nextAnimal.setFriction(0.005);
    nextAnimal.setBounce(0.4);
    nextAnimal.setScale(state.scale);

    const handleCollisions = (collisionData) => {
      const collidedWithA = collisionData.bodyA.gameObject;
      const collidedWithB = collisionData.bodyB.gameObject;

      if (collidedWithA?.texture.key === 'ele') {
        this.createExplosion(collidedWithA.x, collidedWithA.y);
        collidedWithA.destroy(true, true);
      }
      if (collidedWithB?.texture.key === 'ele') {
        this.createExplosion(collidedWithB.x, collidedWithB.y);
        collidedWithB.destroy(true, true);
      }

      nextAnimal.collisionCount++;
      if (nextAnimal.collisionCount >= 25) {
        if (nextAnimal.body) {
          state.queuedForces.push({ x: nextAnimal.x, y: nextAnimal.y });
          this.createExplosion(nextAnimal.x, nextAnimal.y, 'orb');
        }
        nextAnimal.destroy(true, true);
      }
    };

    if (animal === 'mouse') {
      nextAnimal.collisionCount = 0;
      nextAnimal.setOnCollide(handleCollisions);
    }

    this.animalGroup.add(nextAnimal);
    state.renderedCount[animal]++;
  },

  createExplosion: function(x, y, img = 'fire') {
    const particles = this.add.particles(img);

    const emitter = particles.createEmitter({
      x: x,
      y: y,
      alpha: { start: 1, end: 0, ease: 'Power2' },
      scale: { start: 0.5, end: img === 'orb' ? 10 : 2.5 },
      tint: { start: 0xff945e, end: 0xff945e },
      speed: { min: 100, max: 300 },
      accelerationY: -300,
      angle: { min: -85, max: -95 },
      rotate: { min: -180, max: 180 },
      lifespan: { min: 700, max: 1100 },
      blendMode: 'ADD',
      frequency: 110,
      maxParticles: 10,
    });
    emitter.explode();
  },

  removeAllAnimals: function() {
    this.animalGroup.clear(true, true)
  },

  changeScaleAll: function(scale) {
    this.matter.world.scene.children.list.forEach((child) => {
      if (child.texture && child.texture.key != null) {
        child.setScale(scale);
      }
    });
  },

  create: function() {
    this.startDeviceOrientationListener();
    this.matter.world.on('beforeupdate', () => this.beforeUpdate())
    this.info = this.add.text(10, 10, 'Online: 0', { font: '20px Arial', fill: '#FFFFFF' });
    // this.coords = this.add.text(100, 10, 'Orientation: 0, 0', { font: '20px Arial', fill: '#FFFFFF' });

    this.animalGroup = this.add.group();


    socket.on('connect', () => {
      console.log('Connected to server');
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
    });

    socket.on('current_state', ({ connectedUsers, count }) => {
      // console.log(`Current state: ${{ connectedUsers, count }}`);
      state.connectedUsers = connectedUsers;
      state.count = count;
      this.info.setText(`Online: ${connectedUsers}`);
    });


    socket.on('reset_state', () => {
      state = JSON.parse(JSON.stringify(initialState));
      this.removeAllAnimals();
    })

    socket.on('animal_updated', ({ animal, count, pos }) => {
      // console.log(`Received new count: ${count}`);
      state.count[animal] = count;

      state.queued.push({ animal, pos })
    });

    socket.on('connected_updated', (connectedUsers) => {
      // console.log(`Connected updated: ${connectedUsers}`);
      state.connectedUsers = connectedUsers;
      this.info.setText(`Online: ${connectedUsers}`);
    });

    this.matter.world.setBounds(0, -dimensions.height - 50, dimensions.width, dimensions.height * 2, 100);

    this.input.keyboard.on('keydown-R', () => {
      socket.emit('reset')
    });

    const generateAndAddAnimal = (pos) => {
      const animal = Math.random() < 0.02 ? 'mouse' : 'ele';
      this.addAnimal(animal, { x: pos.x, y: pos.y });
      socket.emit('add_animal', { animal, x: pos.x, y: pos.y });
    }

    this.input.on('pointerdown', (pointer) => {
      isPointerDown = true;
      generateAndAddAnimal(pointer);
      intervalId = setInterval(() => {
        generateAndAddAnimal(pointer);
      }, 67);
    });

    this.input.on('pointerup', () => {
      isPointerDown = false;
      clearInterval(intervalId);
    });
  },

  update: function() {
    // this.matter.world.setGravity(this.gravityX, this.gravityY);

    const scale = 1 / (Math.floor((this.matter.world.localWorld.bodies.length * 0.005 + 1) * 100) / 100);
    if (scale !== state.scale) {
      state.scale = scale;
      this.changeScaleAll(scale);
    }


    while (state.queued.length > 0) {
      const item = state.queued.shift();
      if (state.count[item.animal] > state.renderedCount[item.animal]) {
        this.addAnimal(item.animal, item.pos);
      }
    }

    Object.keys(state.count).forEach(animalKey => {
      if (state.count[animalKey] > state.renderedCount[animalKey]) {
        // console.log(`adding from update ${state.count[animalKey] - state.renderedCount[animalKey]} ${animalKey}`)
        for (let i = 0; i < state.count[animalKey] - state.renderedCount[animalKey]; i++) {
          this.addAnimal(animalKey);
        }
      }
    })
  }
});

const config = {
  type: Phaser.AUTO,
  scale: {
    mode: Phaser.Scale.FIT,
    parent: 'elephall',
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: dimensions.width,
    height: dimensions.height
  },
  scene: [SceneA],
  physics: {
    default: 'matter'
  },
};
const game = new Phaser.Game(config);

// function getAccel() {
//   if (DeviceMotionEvent && DeviceMotionEvent.requestPermission) {
//     DeviceMotionEvent.requestPermission().then(response => {
//       if (response == 'granted') {
//         console.log("accelerometer permission granted");
//         // Do stuff here
//       }
//     }
//   });
// }

// getAccel();