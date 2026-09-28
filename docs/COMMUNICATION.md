# Supports de communication

Configuration → **Supports de communication**, réservé aux administrateurs.

## Vidéo de présentation aux classes

Une vidéo en motion design (1920 × 1080, 30 images/s) qui présente l’APEL aux
enfants : donner vie à l’école, faire sourire, créer des souvenirs,
rassembler. Elle est composée avec [Remotion](https://www.remotion.dev).

### Ce qui est prérempli

Rien n’est à écrire pour obtenir une première version :

- **Couleurs** — tirées du logo de l’école (Configuration → Identité), puis
  ajustées pour rester vives à l’écran : un marine presque noir, un bordeaux
  éteint ou un kaki sont éclaircis et ravivés ; un logo sans couleur (noir et
  blanc, gris) laisse place à une palette par défaut. Voir
  `src/lib/communication/palette.ts`.
- **Textes** — chaque scène a un titre, un sous-titre et une phrase de voix off
  rédigés pour des enfants de 3 à 11 ans, à partir du nom de l’école, des
  événements des douze derniers mois, du nombre de familles adhérentes et de
  bénévoles. Tout est modifiable, scène par scène.
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

Voix de synthèse française naturelle, au choix :

| Service | Modèle | Voix |
|---|---|---|
| OpenAI | `gpt-4o-mini-tts`, guidé par une consigne de ton (chaleureux, enthousiaste, pour des enfants) | liste proposée à l’écran (« coral » par défaut) |
| ElevenLabs | `eleven_multilingual_v2` | identifiant d’une voix française de leur bibliothèque |

La clé d’API se saisit dans l’écran de la vidéo ; elle est chiffrée comme les
autres secrets de la Configuration et n’est jamais renvoyée au navigateur.
Chaque génération est facturée par le fournisseur (quelques centimes pour une
vidéo entière) et plafonnée à 60 par heure et par administrateur. Le serveur
doit pouvoir joindre `api.openai.com` ou `api.elevenlabs.io`.

Une voix reste attachée au texte qu’elle lit : modifier la phrase d’une scène
la marque « à refaire ».

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
