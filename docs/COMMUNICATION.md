# Supports de communication

Entrée **Supports de communication** du menu, réservée aux administrateurs.

## Vidéo de présentation aux parents

Une vidéo en motion design (1920 × 1080, 30 images/s), à projeter en réunion
de rentrée ou à partager aux familles, qui présente l’APEL aux parents :
donner vie à l’école, faire sourire les enfants, créer des souvenirs,
rassembler — et leur donne envie d’adhérer ou de donner un coup de main. Rythmée,
avec des personnages illustrés. Elle est composée avec
[Remotion](https://www.remotion.dev).

### Ce qui est prérempli

Rien n’est à écrire pour obtenir une première version :

- **Couleurs** — tirées du logo de l’école (Configuration → Identité), puis
  ajustées pour rester vives à l’écran : un marine presque noir, un bordeaux
  éteint ou un kaki sont éclaircis et ravivés ; un logo sans couleur (noir et
  blanc, gris) laisse place à une palette par défaut. Voir
  `src/lib/communication/palette.ts`.
- **Textes** — chaque scène a un titre, un sous-titre et une phrase de voix off
  rédigés pour des parents (vouvoiement, ton sobre), à partir du nom de
  l’école, des événements publiés de l’année scolaire, du nombre de familles
  adhérentes, de bénévoles et de rendez-vous (un chiffre inférieur à 5 n’est
  pas montré). Tout est modifiable, scène par scène.
- **Écran final** — la cotisation publiée et un QR code vers la page « Nous
  rejoindre », lisible depuis le fond d’une salle. Il suppose que l’adresse
  publique du site (`APP_URL`) est configurée ; sans elle, pas de QR code.
- **Équipe** — les prénoms des comptes administrateurs et organisateurs peuvent
  être repris d’un clic.

### Photos

Photos des bienfaits (achats, sorties, voyages financés…) et des membres, dans
le scope de fichiers privé `media` : elles ne sont jamais servies
publiquement. Elles sont réduites à 1 920 px dans le navigateur avant l’envoi.

La vidéo n’affiche aucune photo tant que l’administrateur n’a pas coché
l’attestation de droit à l’image (accord des personnes photographiées, et des
parents pour les enfants).

### Musique et bruitages

- **Musique générée** — composée par l’application elle-même
  (`src/remotion/class-video/audio-synth.ts`) : aucune question de droits.
- **Musique importée** — un MP3, WAV, OGG ou M4A libre de droits (Pixabay
  Music, YouTube Audio Library…), qui remplace la musique générée.
- La musique baisse automatiquement pendant la voix off.

### Voix off

Trois façons de donner une voix à chaque scène :

1. **Voix intégrée (par défaut)** — des voix françaises open source
   ([Piper](https://github.com/rhasspy/piper)), calculées sur le processeur du
   serveur par [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx). Ni clé
   d’API, ni service tiers, ni carte graphique : une phrase de dix secondes se
   calcule en une seconde environ.

   | Voix | Modèle | Licence du jeu de données |
   |---|---|---|
   | Jessica (féminine), Pierre (masculine) | `fr_FR-upmc-medium` | CC-BY-SA 4.0 (UPMC) |
   | Siwis (féminine) | `fr_FR-siwis-medium` | CC-BY 4.0 (SIWIS) |

   La voix « tom » du catalogue Piper est écartée : son jeu de données est sous
   AGPL. Les modèles (80 à 90 Mo chacun) sont téléchargés au premier usage
   depuis les versions publiées de sherpa-onnx (`github.com`), vérifiés par
   empreinte SHA-256, puis gardés dans `UPLOADS_DIR/.voix` — sous Docker, le
   volume des fichiers, qui survit aux mises à jour. `TTS_MODELS_DIR` permet de
   choisir un autre dossier. La première génération prend donc environ une
   minute, les suivantes une seconde.

   Le module natif existe pour Linux, macOS et Windows (x64 et arm64). Sur une
   plateforme sans module (hébergement serverless, par exemple), l’écran le
   signale et propose les deux autres voies.

2. **Services en ligne**, plus expressifs, facturés à l’usage :

   | Service | Modèle | Voix |
   |---|---|---|
   | OpenAI | `gpt-4o-mini-tts`, guidé par une consigne de ton (parent qui s’adresse à d’autres parents) | liste proposée à l’écran (« coral » par défaut) |
   | ElevenLabs | `eleven_multilingual_v2` | identifiant d’une voix française de leur bibliothèque |

   La clé d’API se saisit dans l’écran de la vidéo ; elle est chiffrée comme les
   autres secrets de la Configuration et n’est jamais renvoyée au navigateur.
   Le serveur doit pouvoir joindre `api.openai.com` ou `api.elevenlabs.io`.

3. **Enregistrement au micro** — un parent lit le texte de la scène, affiché
   comme sur un prompteur, réécoute et garde la prise (WebM/Opus, ou MP4/AAC
   sous Safari). Le site autorise le micro pour lui-même seulement
   (`Permissions-Policy: microphone=(self)`).

Les générations sont plafonnées par administrateur : 60 par heure chez un
service en ligne, 200 avec la voix intégrée. Une voix reste attachée au texte
qu’elle lit : modifier la phrase d’une scène la marque « à refaire ».

### Export

L’export se fait **dans le navigateur** de l’administrateur
(`@remotion/web-renderer`, WebCodecs) : rien n’est calculé sur le serveur, qui
n’a besoin ni de Chrome ni de ffmpeg.

- Chrome, Edge ou Safari : **MP4** (H.264 + AAC), lu par les vidéoprojecteurs,
  téléviseurs et PowerPoint.
- Navigateur sans encodeur H.264 : **WebM** (VP9/VP8 + Opus).

### Licence Remotion

Remotion est gratuit pour les associations à but non lucratif
([remotion.dev/license](https://www.remotion.dev/license)) ; l’export le
déclare avec la clé `free-license`. Le signalement d’usage que Remotion
envoie à `remotion.pro` après un export est bloqué par la politique de
sécurité du contenu du site, sans effet sur la vidéo.
