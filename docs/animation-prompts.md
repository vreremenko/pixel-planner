# Промпты для анимаций упражнений

Для каждого упражнения из справочника (`src/modules/gym/domain/catalog.ts`) нужен лист кадров — sprite sheet. Атлет тот же, что на `athlete.png`: приложите эту картинку к запросу как образец персонажа.

## Общий промпт (вставлять перед описанием упражнения)

```
Pixel art sprite sheet, 16-bit style, the SAME original muscular fighter as in the attached reference
image (same face, hair, skin tone, dark blue shorts, white hand wraps, same proportions and pixel size).
Plain flat white background, no text, no floor shadow, no extra objects except the listed equipment.
Frames are placed in ONE horizontal row, evenly spaced, identical scale and baseline in every frame,
the character does not drift between frames. Equipment in simple grey/steel pixel art.
Smooth looped motion: the last frame flows back into the first.
Exercise: <ВСТАВИТЬ ОПИСАНИЕ НИЖЕ>
```

## Что важно для всех листов
- Один ряд кадров, у всех кадров одинаковые размер, масштаб и положение пола. Так я разрежу лист автоматически.
- Количество кадров — как указано у упражнения (4–6). Первый и последний кадры должны стыковаться.
- Вид указан у каждого упражнения, чаще всего сбоку: так лучше видно движение.
- Без лишних предметов. Скамья, стойка или тренажёр — простые, серые.
- Если персонаж «поплыл» (другое лицо или пропорции), лучше перегенерировать: в анимации это заметно сильнее, чем на одной картинке.

Формат описаний ниже: **вид · снаряд · кадры: поза 1 → поза 2 → …**. Описания можно вставлять в общий промпт как есть, на английском генераторы понимают лучше, поэтому для каждого упражнения дана английская строка.

## Грудь

1. **Жим штанги лёжа** (`bench-press`)
   `side view, lying on a flat bench, barbell; 6 frames: arms extended holding barbell over chest → lowering → bar touching lower chest → pressing up → arms extended`
2. **Жим штанги на наклонной скамье** (`incline-bench-press`)
   `side view, lying on a bench inclined 30–45°, barbell; 6 frames: arms extended over upper chest → lowering → bar at upper chest → pressing up → arms extended`
3. **Жим гантелей лёжа** (`dumbbell-press`)
   `side view, lying on a flat bench, one dumbbell in each hand; 6 frames: dumbbells pressed up over chest → lowering → dumbbells at chest level, elbows below bench → pressing up → arms extended`
4. **Жим гантелей на наклонной** (`incline-dumbbell-press`)
   `side view, lying on an incline bench, dumbbells; 6 frames: dumbbells up over upper chest → lowering → at upper chest → pressing up → extended`
5. **Разведения гантелей лёжа** (`dumbbell-fly`)
   `front view from above the feet, lying on a flat bench, dumbbells, elbows slightly bent; 6 frames: dumbbells together over chest → arms opening wide in an arc → arms wide at chest level → closing arc → together`
6. **Сведение в кроссовере** (`cable-crossover`)
   `front view, standing between two cable pulleys, one step forward, torso slightly leaning; 5 frames: arms open wide holding handles → bringing hands together in an arc → hands meeting in front of the lower chest → opening → wide`
7. **Отжимания на брусьях (грудь)** (`chest-dips`)
   `side view, on parallel dip bars, torso leaning forward; 6 frames: arms straight supporting body → lowering → elbows at 90°, shoulders below elbows level → pushing up → arms straight`
8. **Отжимания от пола** (`push-ups`)
   `side view, push-up position on the floor, body straight; 6 frames: arms straight → lowering → chest near floor → pushing up → arms straight`
9. **Жим в тренажёре на грудь** (`machine-chest-press`)
   `side view, seated in a chest press machine, back on the pad; 5 frames: handles at chest → pressing forward → arms almost straight → returning → handles at chest`

## Спина

10. **Подтягивания** (`pull-ups`)
    `back view, hanging from a pull-up bar, grip slightly wider than shoulders; 6 frames: dead hang arms straight → pulling up → chin above the bar, shoulder blades squeezed → lowering → dead hang`
11. **Тяга верхнего блока** (`lat-pulldown`)
    `side view, seated at a lat pulldown machine, wide bar overhead; 5 frames: arms extended up holding bar → pulling down → bar at upper chest, elbows down → returning up → extended`
12. **Тяга штанги в наклоне** (`barbell-row`)
    `side view, standing bent over about 45°, back straight, barbell; 5 frames: arms hanging straight → rowing → bar at lower belly, elbows back → lowering → arms straight`
13. **Тяга гантели одной рукой** (`dumbbell-row`)
    `side view, one knee and one hand on a flat bench, dumbbell in the other hand; 5 frames: arm hanging straight → rowing → dumbbell at the hip, elbow up → lowering → straight`
14. **Тяга горизонтального блока** (`seated-cable-row`)
    `side view, seated at a low cable row, feet on platform, knees slightly bent; 5 frames: arms extended forward → pulling → handle at belly, chest out → returning → extended`
15. **Становая тяга** (`deadlift`)
    `side view, barbell on the floor; 6 frames: bent knees and hips, back straight, gripping bar on floor → bar passing knees → standing upright with bar at hips → lowering past knees → bar on floor`
16. **Тяга Т-грифа** (`t-bar-row`)
    `side view, standing bent over about 45° over a T-bar row, handle in both hands; 5 frames: arms straight → rowing → handle at lower chest → lowering → straight`
17. **Гиперэкстензия** (`hyperextension`)
    `side view, on a 45° hyperextension bench, hips on the pad, arms crossed on chest; 5 frames: body in a straight line → bending down at the hips → torso pointing down → rising → straight line`
18. **Шраги** (`shrugs`)
    `front view, standing, dumbbells in hanging arms; 4 frames: shoulders relaxed → shoulders raised up to the ears → hold → shoulders down`

## Плечи

19. **Жим штанги стоя** (`overhead-press`)
    `side view, standing, barbell; 6 frames: bar at upper chest/front shoulders → pressing up → arms locked overhead, head through → lowering → bar at shoulders`
20. **Жим гантелей сидя** (`dumbbell-shoulder-press`)
    `front view, seated on an upright bench, dumbbells; 5 frames: dumbbells at ear level, elbows down → pressing up → arms extended overhead → lowering → at ear level`
21. **Махи гантелями в стороны** (`lateral-raise`)
    `front view, standing, dumbbells, elbows slightly bent; 5 frames: arms down at the sides → raising sideways → arms at shoulder height (T shape) → lowering → down`
22. **Подъём гантелей перед собой** (`front-raise`)
    `side view, standing, dumbbells; 5 frames: arms down in front of thighs → raising forward → arms at eye level → lowering → down`
23. **Разведения в наклоне** (`rear-delt-fly`)
    `front view, standing bent forward almost parallel to the floor, dumbbells; 5 frames: arms hanging down → raising out to the sides → arms out wide at shoulder level → lowering → hanging`
24. **Тяга к лицу** (`face-pull`)
    `side view, standing facing a cable machine, rope at face height; 5 frames: arms extended forward → pulling rope toward the face, elbows high and wide → rope at face → returning → extended`
25. **Жим Арнольда** (`arnold-press`)
    `front view, seated, dumbbells; 6 frames: dumbbells at chest with palms facing the body → rotating palms outward while pressing → arms extended overhead → rotating back while lowering → start`
26. **Тяга штанги к подбородку** (`upright-row`)
    `front view, standing, barbell; 5 frames: bar at thighs → pulling up along the body, elbows leading → elbows at shoulder height, bar at chest → lowering → thighs`

## Руки

27. **Подъём штанги на бицепс** (`barbell-curl`)
    `side view, standing, barbell, elbows at the sides; 5 frames: arms straight bar at thighs → curling → bar at shoulders → lowering → straight`
28. **Подъём гантелей на бицепс** (`dumbbell-curl`)
    `front view, standing, dumbbells, palms forward; 5 frames: arms straight → curling with wrists turning up → dumbbells at shoulders → lowering → straight`
29. **Молотки** (`hammer-curl`)
    `side view, standing, dumbbells with palms facing each other; 5 frames: arms straight → curling (neutral grip) → dumbbells at shoulders → lowering → straight`
30. **Сгибания на скамье Скотта** (`preacher-curl`)
    `side view, seated at a preacher bench, upper arms on the pad, EZ-bar; 5 frames: arms almost straight → curling → bar near shoulders → lowering slowly → almost straight`
31. **Разгибания на блоке (трицепс)** (`triceps-pushdown`)
    `side view, standing facing a high cable, straight bar, elbows pinned to sides; 5 frames: forearms up, elbows bent → pushing down → arms fully straight → returning → bent`
32. **Французский жим лёжа** (`skull-crusher`)
    `side view, lying on a flat bench, EZ-bar; 5 frames: arms vertical holding bar over chest → bending elbows → bar near forehead, upper arms still → extending → vertical`
33. **Разгибание гантели из-за головы** (`overhead-triceps`)
    `side view, seated, one dumbbell held with both hands overhead; 5 frames: arms extended overhead → lowering dumbbell behind head, elbows pointing up → deep stretch → extending → overhead`
34. **Жим узким хватом** (`close-grip-bench`)
    `side view, lying on a flat bench, barbell with shoulder-width grip, elbows close to body; 6 frames: arms extended → lowering → bar at lower chest → pressing → extended`
35. **Отжимания на брусьях (трицепс)** (`triceps-dips`)
    `side view, on parallel dip bars, torso upright, elbows back; 6 frames: arms straight → lowering → elbows at 90° → pushing up → straight`
36. **Сгибания запястий** (`wrist-curl`)
    `side view, seated, forearms resting on a bench, palms up holding a barbell; 4 frames: wrists bent down → curling wrists up → wrists fully flexed → lowering`

## Ноги

37. **Приседания со штангой** (`squat`)
    `side view, barbell on upper back, feet shoulder width; 6 frames: standing tall → hips back and down → thighs parallel to the floor, back straight → rising → standing`
38. **Фронтальные приседания** (`front-squat`)
    `side view, barbell resting on front shoulders, elbows high; 6 frames: standing → squatting down with upright torso → deep squat → rising → standing`
39. **Жим ногами** (`leg-press`)
    `side view, seated in a 45° leg press machine, feet on the platform; 5 frames: legs almost straight → lowering platform → knees at 90° → pressing → almost straight`
40. **Выпады** (`lunges`)
    `side view, standing, dumbbells in hands; 6 frames: standing → long step forward → both knees at 90°, back knee near floor → pushing back → standing`
41. **Болгарские выпады** (`bulgarian-split-squat`)
    `side view, rear foot on a bench behind, dumbbells; 5 frames: standing split stance → lowering straight down → front thigh parallel, back knee near floor → rising → start`
42. **Румынская тяга** (`romanian-deadlift`)
    `side view, standing with barbell, knees slightly bent and fixed; 5 frames: standing, bar at hips → hips back, bar sliding down thighs → bar below knees, back flat, torso near horizontal → rising → standing`
43. **Разгибания ног в тренажёре** (`leg-extension`)
    `side view, seated in a leg extension machine, pad over ankles; 4 frames: knees bent 90° → extending → legs straight → lowering`
44. **Сгибания ног в тренажёре** (`leg-curl`)
    `side view, lying face down on a leg curl machine, pad above heels; 4 frames: legs straight → curling heels up → knees bent fully → lowering`
45. **Ягодичный мост со штангой** (`hip-thrust`)
    `side view, upper back on a bench, barbell over hips, feet on floor; 5 frames: hips down near floor → driving hips up → body straight from shoulders to knees → lowering → down`
46. **Подъёмы на носки** (`calf-raise`)
    `side view, standing on the edge of a step, balls of feet on the step; 4 frames: heels below the step → rising on toes → highest point → lowering`
47. **Гоблет-присед** (`goblet-squat`)
    `side view, holding one dumbbell vertically at the chest; 6 frames: standing → squatting down → deep squat, elbows between knees → rising → standing`

## Пресс

48. **Скручивания** (`crunches`)
    `side view, lying on the back on the floor, knees bent, hands behind head; 4 frames: lying flat → curling shoulders up → shoulder blades off the floor → lowering`
49. **Подъём ног в висе** (`hanging-leg-raise`)
    `side view, hanging from a pull-up bar; 5 frames: legs hanging straight → raising legs → legs horizontal or higher, pelvis tucked → lowering → hanging`
50. **Планка** (`plank`)
    `side view, forearm plank on the floor, body straight; 4 frames: holding plank → subtle breathing motion (very small chest movement) → holding → breathing (idle loop)`
51. **Боковая планка** (`side-plank`)
    `front view, side plank on one forearm and the edge of one foot, body straight; 4 frames: holding → subtle breathing → holding → breathing (idle loop)`
52. **Русские скручивания** (`russian-twist`)
    `front view, seated on the floor leaning back, knees bent, feet off the floor, hands together; 6 frames: hands center → rotating torso to the left, hands near left hip → center → rotating to the right → center`
53. **Скручивания на блоке** (`cable-crunch`)
    `side view, kneeling facing a high cable, rope held at the head; 5 frames: torso upright → crunching down, ribs toward pelvis → head near knees → rising → upright`
54. **Ролик для пресса** (`ab-wheel`)
    `side view, kneeling on the floor holding an ab wheel; 6 frames: wheel under shoulders → rolling forward → body extended near floor, back flat → rolling back → start`

## Кардио

55. **Бег** (`running`)
    `side view, running in place (treadmill-style, no background); 6 frames: standard running cycle — contact, push-off, flight, opposite leg contact, push-off, flight`
56. **Велосипед** (`cycling`)
    `side view, on a stationary exercise bike; 6 frames: full pedal revolution in 6 positions`
57. **Гребной тренажёр** (`rowing-machine`)
    `side view, on a rowing machine; 6 frames: catch (knees bent, arms forward) → legs drive → torso lean back → arms pull handle to lower chest → arms forward → slide back to catch`
58. **Скакалка** (`jump-rope`)
    `front view, jumping rope; 4 frames: on toes, rope overhead → small jump, rope passing in front → in the air, rope under feet → landing on toes`
59. **Эллипс** (`elliptical`)
    `side view, on an elliptical trainer holding the moving handles; 6 frames: full elliptical stride cycle`
60. **Ходьба** (`walking`)
    `side view, walking in place (no background); 6 frames: standard walking cycle with arms swinging`

## Как отдать мне
Сохраните листы в одну папку с именами по id: `bench-press.png`, `squat.png` и т. д. Можно не все сразу: начните с тех упражнений, что делаете чаще. Я разрежу листы на кадры, переведу их в нашу пиксельную палитру и подключу анимацию в карточке упражнения.
