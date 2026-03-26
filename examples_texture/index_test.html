import mat from './material.js'

export const createScene = function () {
    var scene = new BABYLON.Scene(engine);
   
    var camera = new BABYLON.ArcRotateCamera("camera1", 0, 0, 0, new BABYLON.Vector3(-1.5, 3.8, -3), scene);
    camera.setTarget(BABYLON.Vector3.Zero());
    camera.attachControl(canvas, true);
    camera.wheelPrecision = 100

    const ground = BABYLON.MeshBuilder.CreateGround("ground", { subdivisions: 70, width: 2, height: 2 }, scene);
    const material = BABYLON.NodeMaterial.Parse(mat, scene)
    ground.material = material

    function updateGroundTessalation(subdivisions){
        const vertexData = BABYLON.CreateGroundVertexData({
            size: 2, subdivisions: subdivisions
        })
        vertexData.applyToMesh(ground)
    }

    // material inputs
    const tileCountXInput = material.getBlockByName("Tile count x")
    const tileCountYInput = material.getBlockByName("Tile count y")
    const offsetInput = material.getBlockByName("Offset")
    const tileSizeInput = material.getBlockByName("Tile size")
    const rotationJitterInput = material.getBlockByName("Rotation jitter")
    const elevationStrengthInput = material.getBlockByName("Elevation strength")
    const elevationJitterInput = material.getBlockByName("Elevation jitter")
    const edgeWearInput = material.getBlockByName("Edge wear")
    const tilesAmountInput = material.getBlockByName("Tiles amount")
    const cracksAmountInput = material.getBlockByName("Cracks amount")
    const mossAmountInput = material.getBlockByName("Moss amount")
    const mossStrengthInput = material.getBlockByName("Moss strength")
    const mossHeightInput = material.getBlockByName("Moss height")
    const randomSeedInput = material.getBlockByName("Random seed")
    const saturationInput = material.getBlockByName("Saturation")
    const brightnessInput = material.getBlockByName("Brightness")
    const contrastInput = material.getBlockByName("Contrast")
    const tileColorInput = material.getBlockByName("Tile color")
    const tileColor2Input = material.getBlockByName("Tile color 2")
    const occlusionColorInput = material.getBlockByName("Occlusion color")
    const edgeColorInput = material.getBlockByName("Edge color")
    const mossColorInput = material.getBlockByName("Moss color")
    const mossColor2Input = material.getBlockByName("Moss color 2")


    // gui
    const oldgui = document.getElementById("datGUI");

    if (oldgui != null) {
        oldgui.remove();
    }

    const gui = new dat.GUI();
    gui.domElement.style.marginTop = "70px";
    gui.domElement.id = "datGUI";

    // presets
    const presets = {
        "Mossy brick wall":{ "randomSeed":0.03,"tileCountX":5,"tileCountY":12,"offset":0.5,"tileSize":0.34,"rotationJitter":1,"tessalation": 80,"elevationStrength":0.24471458773784355,"elevationJitter":0.38,"edgeWear":0.44,"tilesAmount":0.89,"cracksAmount":0.38,"mossAmount":0.33,"mossStrength":0.95,"mossHeight":0.45,"tileColor":[255,255,196.484375],"tileColor2":[187.5,158.06102457430342,144.47380514705884],"mossColor":[159.8825731464461,197.5,111.51731004901961],"mossColor2":[98,123,141],"edgeColor":[255,253.40992647058826,241.484375],"occlusionColor":[110,105.24816176470588,108.94403594771244],"sceneColor":[163,224,250],"saturation":0,"brightness":1,"contrast":1.1338962605548855},
        "Dirty ground tiles": {"randomSeed":0.03,"tileCountX":5,"tileCountY":5,"offset":0,"tileSize":0.3463725659141823,"rotationJitter":1,"tessalation": 80,"elevationStrength":0.24471458773784355,"elevationJitter":0.19196967085990005,"edgeWear":0.14785455798724798,"tilesAmount":0.89,"cracksAmount":0.169912114423574,"mossAmount":0.6331207995864209,"mossStrength":0.8536963639496812,"mossHeight":0.158883336205411,"tileColor":[242.5,242.5,198.74004289215688],"tileColor2":[177.5,161.5377080108359,154.1704963235294],"mossColor":[190,171.69784457900812,127.77267156862744],"mossColor2":[125.00000000000001,102.44332107843138,115.71195573817765],"edgeColor":[255,253.40992647058826,241.484375],"occlusionColor":[132.49999999999997,126.77619485294116,131.22804330065358],"sceneColor":[163,224,250],"saturation":0,"brightness":1,"contrast":1.1338962605548855},
        "Overgrown by grass": {"randomSeed":0.36843012235050837,"tileCountX":5,"tileCountY":5,"offset":0.3463725659141823,"tileSize":0.8,"rotationJitter":1,"tessalation":100,"elevationStrength":0.4,"elevationJitter":0.05962433224194382,"edgeWear":0.29122867482336723,"tilesAmount":0.7669308978114768,"cracksAmount":0,"mossAmount":0.732379803549888,"mossStrength":0.8867826986041702,"mossHeight":0,"tileColor":[183.97518382352942,237.82060986159172,245],"tileColor2":[90.7781862745098,99.45754036908883,100.00000000000001],"mossColor":[106.7924596309112,137.50000000000003,72.24647671568628],"mossColor2":[92.99429606401385,122.49999999999999,66.76700367647058],"edgeColor":[159.81158088235293,195,186.7203719723183],"occlusionColor":[114.72809436274511,117.50000000000001,115.2172541810842],"sceneColor":[161.484375,232.9963235294117,255],"saturation":-0.24108219886265725,"brightness":1.3544718249181458,"contrast":1.420644494227124},
        "Snowy rock wall": {"randomSeed":0.03,"tileCountX":5,"tileCountY":5,"offset":0.4787179045321385,"tileSize":0.6331207995864209,"rotationJitter":0.40151645700499744,"tessalation": 130,"elevationStrength":0.24471458773784355,"elevationJitter":0.25814234016887816,"edgeWear":0.4787179045321385,"tilesAmount":1,"cracksAmount":0.3243150094778563,"mossAmount":0.6992934688953989,"mossStrength":1,"mossHeight":0.4787179045321385,"tileColor":[198.74004289215688,224.48119413206462,242.5],"tileColor2":[128.54932598039218,155.00000000000003,155.00000000000003],"mossColor":[239.116881127451,246.98930399365628,252.5],"mossColor2":[150.24280024509804,172.48148248269896,197.5],"edgeColor":[241.484375,252.61488970588235,255],"occlusionColor":[80.7421875,105.49632352941178,127.5],"sceneColor":[163,224,250],"saturation":0,"brightness":1,"contrast":1.1338962605548855},
        "Ice castle": {"randomSeed":0.03,"tileCountX":4,"tileCountY":4,"offset":0.5890056867137687,"tileSize":0.3463725659141823,"rotationJitter":0.5228330174047906,"tessalation": 102,"elevationStrength":0.24471458773784355,"elevationJitter":0.19196967085990005,"edgeWear":0.026537997587454766,"tilesAmount":1,"cracksAmount":0,"mossAmount":0,"mossStrength":0,"mossHeight":0,"tileColor":[173.98437500000003,255,255],"tileColor2":[152.47472426470588,187.77776275951553,252.5],"mossColor":[190,171.69784457900812,127.77267156862744],"mossColor2":[125.00000000000001,102.44332107843138,115.71195573817765],"edgeColor":[255,255,255],"occlusionColor":[85.56295955882352,131.58845155709346,172.5],"sceneColor":[150.28339460784315,167.6134282736083,175],"saturation":0.08978114768223322,"brightness":1.0236084783732553,"contrast":1.1338962605548855},
        "Molten rock dungeon": {"randomSeed":0.169912114423574,"tileCountX":5,"tileCountY":5,"offset":0.3463725659141823,"tileSize":1,"rotationJitter":1,"tessalation": 50,"elevationStrength":0.5,"elevationJitter":0.25814234016887816,"edgeWear":0.46,"tilesAmount":0.7669308978114768,"cracksAmount":0.05962433224194382,"mossAmount":0.7764949164225401,"mossStrength":1,"mossHeight":0,"tileColor":[242.5,198.74004289215688,198.74004289215688],"tileColor2":[110,80.33124279123415,73.97365196078432],"mossColor":[182.5,80.94885380622843,38.63587622549019],"mossColor2":[230,207.07792675893893,35.16237745098038],"edgeColor":[220,154.41789215686276,154.41789215686276],"occlusionColor":[237.5,137.34320934256058,24.66681985294118],"sceneColor":[67.49999999999999,59.214559904844286,47.378216911764696],"saturation":0.17801137342753748,"brightness":1.0897811476822332,"contrast":1.486817163536102},
        "Alien panels": {"randomSeed":0.169912114423574,"tileCountX":2,"tileCountY":6,"offset":0.3574013441323453,"tileSize":0.4897466827503016,"rotationJitter":0.5559193520592797,"tessalation": 64,"elevationStrength":0.0794416681027055,"elevationJitter":0,"edgeWear":0,"tilesAmount":1,"cracksAmount":0,"mossAmount":0,"mossStrength":0,"mossHeight":0,"tileColor":[107.07184436274508,107.22295811707033,107.49999999999999],"tileColor2":[45.00000000000001,45.00000000000001,45.00000000000001],"mossColor":[182.5,80.94885380622843,38.63587622549019],"mossColor2":[0,0,0],"edgeColor":[215,171.98682598039215,171.98682598039215],"occlusionColor":[237.5,24.66681985294118,24.66681985294118],"sceneColor":[113.41452205882352,114.253892733564,114.99999999999999],"saturation":0.17801137342753748,"brightness":1.0897811476822332,"contrast":1.486817163536102},
    }


    const options = {
        preset: 'Mossy brick wall',
        ...presets["Mossy brick wall"],
        createPreset: () => {
            console.log(JSON.stringify(options))
        }
    }

    function applyPreset(presetName) {
        const preset = presets[presetName]
        if (!preset) return
        gui.__controllers.forEach(c => {
            const prop = c.property
            if (prop !== "preset" && preset.hasOwnProperty(prop)) {
                c.setValue(preset[prop])
            }
        })
        for (const [key, folder] of Object.entries(gui.__folders)) {
            folder.__controllers.forEach(c => {
                const prop = c.property
                if (prop !== "preset" && preset.hasOwnProperty(prop)) {
                    c.setValue(preset[prop])
                }
            })
        }

    }


    // controls

    gui.add(options, 'preset', Object.keys(presets)).name("Select preset").onChange((value) => {
        applyPreset(value)
    })

    const controlsFolder = gui.addFolder("Controls")

    controlsFolder.add(options, "randomSeed", 0, 1).name("Random seed").onChange(function (value) {
        if (randomSeedInput) {
            randomSeedInput.value = value
        }
    });
    controlsFolder.add(options, "tileCountX", 2, 20).step(1).name("Tile count x").onChange(function (value) {
        if (tileCountXInput) {
            tileCountXInput.value = value
        }
    });
    controlsFolder.add(options, "tileCountY", 2, 20).step(1).name("Tile count y").onChange(function (value) {
        if (tileCountYInput) {
            tileCountYInput.value = value
        }
    });
    controlsFolder.add(options, "offset", 0, 1).name("Offset").onChange(function (value) {
        if (offsetInput) {
            offsetInput.value = value
        }
    });
    controlsFolder.add(options, "tileSize", 0, 1).name("Tile size").onChange(function (value) {
        if (tileSizeInput) {
            tileSizeInput.value = value
        }
    });
    controlsFolder.add(options, "rotationJitter", 0, 1).name("Rotation jitter").onChange(function (value) {
        if (rotationJitterInput) {
            rotationJitterInput.value = value
        }
    });
    controlsFolder.add(options, "tessalation", 50, 200).step(1).name("Tessalation").onChange(function (value) {
        updateGroundTessalation(value)
    });
    controlsFolder.add(options, "elevationStrength", 0, 0.5).name("Elevation strength").onChange(function (value) {
        if (elevationStrengthInput) {
            elevationStrengthInput.value = value
        }
    });
    controlsFolder.add(options, "elevationJitter", 0, 1).name("Elevation jitter").onChange(function (value) {
        if (elevationJitterInput) {
            elevationJitterInput.value = value
        }
    });
    controlsFolder.add(options, "edgeWear", 0, 1).name("Edge wear").onChange(function (value) {
        if (edgeWearInput) {
            edgeWearInput.value = value
        }
    });
    controlsFolder.add(options, "tilesAmount", 0.5, 1).name("Tiles amount").onChange(function (value) {
        if (tilesAmountInput) {
            tilesAmountInput.value = value
        }
    });
    controlsFolder.add(options, "cracksAmount", 0, 1).name("Cracks amount").onChange(function (value) {
        if (cracksAmountInput) {
            cracksAmountInput.value = value
        }
    });
    controlsFolder.add(options, "mossAmount", 0, 1).name("Moss amount").onChange(function (value) {
        if (mossAmountInput) {
            mossAmountInput.value = value
        }
    });
    controlsFolder.add(options, "mossStrength", 0, 1).name("Moss strength").onChange(function (value) {
        if (mossStrengthInput) {
            mossStrengthInput.value = value
        }
    });
    controlsFolder.add(options, "mossHeight", 0, 1).name("Moss height").onChange(function (value) {
        if (mossHeightInput) {
            mossHeightInput.value = value
        }
    });

    const colorsFolder = gui.addFolder("Colors")
    colorsFolder.addColor(options, 'edgeColor').name('Edge color').onChange(value => {
        if (edgeColorInput) {
            edgeColorInput.value = new BABYLON.Color3(value[0] / 255, value[1] / 255, value[2] / 255)
        }
    })
    colorsFolder.addColor(options, 'tileColor').name('Tile color').onChange(value => {
        if (tileColorInput) {
            tileColorInput.value = new BABYLON.Color3(value[0] / 255, value[1] / 255, value[2] / 255)
        }
    })
    colorsFolder.addColor(options, 'tileColor2').name('Tile color 2').onChange(value => {
        if (tileColor2Input) {
            tileColor2Input.value = new BABYLON.Color3(value[0] / 255, value[1] / 255, value[2] / 255)
        }
    })
    colorsFolder.addColor(options, 'occlusionColor').name('Occlusion color').onChange(value => {
        if (occlusionColorInput) {
            occlusionColorInput.value = new BABYLON.Color3(value[0] / 255, value[1] / 255, value[2] / 255)
        }
    })
    colorsFolder.addColor(options, 'mossColor').name('Moss color').onChange(value => {
        if (mossColorInput) {
            mossColorInput.value = new BABYLON.Color3(value[0] / 255, value[1] / 255, value[2] / 255)
        }
    })
    colorsFolder.addColor(options, 'mossColor2').name('Moss color 2').onChange(value => {
        if (mossColor2Input) {
            mossColor2Input.value = new BABYLON.Color3(value[0] / 255, value[1] / 255, value[2] / 255)
        }
    })
    colorsFolder.addColor(options, 'sceneColor').name('Scene color').onChange(value => {
        scene.clearColor = new BABYLON.Color3(value[0] / 255, value[1] / 255, value[2] / 255)
    })

    const filterFolder = gui.addFolder("Filters")
    filterFolder.add(options, "saturation", -1, 1).name("Saturation").onChange(function (value) {
        if (saturationInput) {
            saturationInput.value = value
        }
    });
    filterFolder.add(options, "brightness", 0, 2).name("Brightness").onChange(function (value) {
        if (brightnessInput) {
            brightnessInput.value = value
        }
    });
    filterFolder.add(options, "contrast", 0, 2).name("Constrast").onChange(function (value) {
        if (contrastInput) {
            contrastInput.value = value
        }
    });
    gui.add(options, "createPreset").name("Log preset")


    applyPreset("Mossy brick wall")

    return scene;
};