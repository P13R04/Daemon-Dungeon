Instructions sur les voicelines / popups du daemon

Le daemon est une entité informatique qui apparait via des popups sur l’écran pour interagir avec le joueur via des phrases de moquerie, ou de commentaires liés aux events de la game.
Ils peuvent avoir lieu lorsque le joueur prend des dégâts, tue un ennemi/boss, clear une room, déclenche un spell (ulti), arriver à une room certaine etc…

Sa personnalité est cynique et moqueuse, et il peut éventuellement avoir pitié du joueur à certains moments de façon paternaliste en le voyant comme faible. Dans le lore du jeu il a pris contrôle du système informatique et se sert du joueur comme d’une experience pour tester ses performances, comme un benchmark dans une simulation (le donjon). 

Les voicelines ne doivent pas être trop répétitives et suffisamment variées, et doivent implicitement (ou explicitement mais pas de façon trop lourde) servir la narration et donner le contexte du jeu sans gêner la fluidité du gameplay arcade / roguelike par room. Les phrases liées au « lore » brut devront être proc en début de salle du genre « on dirait que le joueur a compris qu’on était dans une simulation » « reboot numero quarante deux, dernier score, null » ou des phrases qui montrent que le daemon a pris le contrôle du système et qu’on essaie de lutter. 

Il y a un système de d’event des voicelines à développer pour s’assurer un cooldown entre voicelines du même type (on ne proc pas 2 fois des voicelines liés au dégâts de pics en quelques secondes) ou alors on peut faire monter une barre pour certains events (exemple : aux premiers dégâts contre un zombie dans une salle, rien ne sa passe, puis si il y a plusieurs fois des dégâts successifs le daemon nous met en garde « tu essaies de speedrun ta mort ou quoi ? » Ou si on reste immobile un certain temps etc…
L’idée est d’avoir des events et des voicelines suffisamment variées pour varier les runs d’un point de vue narratif et en faire une vraie expérience et un point d’interêt majeur du jeu. Il doit y avoir une part d’aléatoire pour que les mêmes voicelines ne soient pas répétées en boucle ET que les mêmes types de voicelines ne proc pas au même moment si on répète le même gameplay (par exemple une fois de la narration, une fois un react à tel élément de gameplay (dégâts subis) une fois un autre élément de gameplay (dégâts infligés ou ennemi tué) etc… en gérant bien l’espace entre les voicelines pour qu’elles soient suffisamment espacées, variées et qui restent agréables pour le joueur tout en étant un bon support pour la narration

Toutes les voicelines doivent être en anglais

Le but est d’intégrer suffisamment de voicelines différentes / variées pour qu’elles ne se répètent pas trop à chaque run, et avoir une variété d’events suffisamment grande pour que les voicelines semblent réagir à la run de façon unique

Certaines voicelines sont justes « ambiantes » pour rajouter du contexte / lore

Il y a des variantes personnalisées par classe sachant que
Mage / wizard installer = caster à distance, le daemon peut se moquer car il a « peur » du contact, 
Blagues liées à son rôle comme programme (.exe -> il va vite être exécuté (sens tué) software jetable qui n’a aucun autre but que de télécharger un autre programme, le daemon l’a déjà remplacé etc…)

Tank/firewall = « gros balourd », n’a pas réussi à détecter la menace (du daemon) à temps, juste un sac de frappe,

Rogue/glitch = potentiel instable, ne tient pas en place, glitch sans personnalité, même pas de but propre, reste au contact mais n’encaisse même pas bien les coups



Phrases liées aux dégâts pris sur des mobs :
-jumper = blague sur la compression de fichier
-bull = try to dodge next time
-moquerie sur les dégâts de pics/poison/hazard
-pattern = blague sur le raytracing
-casters = contre le mage : t’es même pas le meilleur caster, contre les autres : si tu restes à distance t’as aucune chance
-zombies = La honte, c’est mes sbires les plus faibles
-pong = I would feel ashamed

Déclencher l’ulti = t’as peur de perdre ?
Atteindre x room = « je vais augmenter la difficulté » « encore là  ?» « l’experience se passe comme prévu, on passe aux choses sérieuses »

Rester immobile plus de quelques secondes dans une salle clear : tu as peur de passer à la suite ?

Arrivée dans une nouvelle salle « une de mes salles préférées »
« Dans cette salle tu n’as aucune chance »

Ne pas hésiter à rajouter des types d’events

Il faut définir plusieurs variantes en gardant l’esprit, mais il peut être étendu à des phrases que peut dire le daemon.



Pour chaque phrase de popup du daemon il doit y avoir des frames associées pour donner un effet animé, on les jouera en mode « ping pong » c’est à dire si je détaille les frames 1-2-3, on jouera 1-2-3-2-1-2-3… en boucle le temps de la voiceline ou en mode loop 1-2-3-4-1-2-3-4…


Lors de la génération des voicelines, il faudra brancher les presets de frames du daemon en fonction de ce guide des émotions :

Chaque image est nommée sous le format emotion_xx (de 01 à 04 max)

bored = ennuyé, non impressionné
bsod = blue screen of death, mini crash du daemon, frame 1 sur quelques frames puis en boucle 2,3,4

censuré/censored : le daemon devient injurieux, deux variantes : censuré = avec visage (1,2,3,4 ping pong) censored = sans visage (1,2,3,4 en boucle)
 
Choqué (1,2) = choqué, ne s’attendait pas à 
Énervé (1,2,3,4 ping pong) = agacé par le joueur (qui s’en sort trop bien?), virulent dans sa phrase

Error (1,2,3,4boucle) = écran d’erreur

goofy(1,2,3 pingpong) = fait le gamin, pas sérieux

happy(1,2,3,4 pingpong) = sympa, interaction agréable mais un peu cynique (il en existe aussi de temps en temps du genre « je vais pouvoir m’amuser encore un peu avec toi » « tu t’en sors bien pour un faible sujet de test)

Init (1,2,3,4) = initialisation du système suite à un plantage
loading(1,2 boucle) = chargement = après init
reboot(1,2,3,4) = avant init

Rire(1,2,3,4 pingpong) = rire moqueur classique

supérieur(1,2,3,4 pingpong) = supérieur, rabaisse le joueur et se sent puissant

Surpris(1,2,3,4 pingpong) = ne s’attendait pas, similaire à choqué mais + de frames

override(1 quelques frames puis 2,3 en boucle puis 4 frame finale) = system hack

La plupart des animations sont jouées telles quelles mais lorsque la voiceline « glitch » on peut ajouter quelques frames d’error.

Parfois le daemon peut crasher en pleine voiceline ce qui se traduit par un déclenchement de frames d’error, un glitch de la voix conséquent, puis bsod (blue screen of death), reboot, init, loading, puis il reprend avec une voiceline spéciale de suite de plantage du genre « tout va bien, j’ai pris une petite pause » et un air supérieur ou « ton incompétence m’a fait planter d’ennui » avec un rire moqueur.

Il faut aussi limiter le glitch dans les voicelines pour qu’il arrive assez rarement (pas à chaque fois, une seul fois max par voiceline et pas un glitch trop conséquent sauf si il déclenche une « erreur + reboot » du daemon. On doit bien avoir des frames animées tant que le popup est actif et il faut aussi faire défiler le texte plus vite qu’actuellement pour qu’il défile en avance sur la synthèse vocale (au moins 250 wpm pour une synthèse à 190 wpm). On reste flexible sur le système pour potentiellement rajouter des six par la suite pendant les frames d’erreurs etc…

