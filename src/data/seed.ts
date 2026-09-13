import type { AppDB } from './db';
import type { CardioField, Exercise, ExerciseKind, Program, WorkoutExercise, WorkoutTemplate } from '../domain/types';
import { startOfWeek, todayISO } from '../domain/dates';
import { defaultSettings } from './repo/settings';

/**
 * Programma iniziale "Scheda palestra" (schede A e B).
 * Gli id sono deterministici: installando l'app su due dispositivi e sincronizzando,
 * i dati iniziali coincidono invece di duplicarsi.
 * I timestamp a 0 fanno sì che qualunque modifica dell'utente prevalga in sincronizzazione.
 */

export const SEED_PROGRAM_ID = 'seed-program-palestra';
const REST_NOTE = 'Recupero 60–90 secondi tra le serie, salvo diversa indicazione.';

const meta = () => ({ createdAt: 0, updatedAt: 0, deletedAt: null });

interface ExerciseSeed {
  key: string;
  name: string;
  muscleGroup: string;
  kind: ExerciseKind;
  description: string;
  notes?: string;
  cardioFields?: CardioField[];
}

const EXERCISES: ExerciseSeed[] = [
  { key: 'chest-press', name: 'Chest Press (Macchina)', muscleGroup: 'Pettorali', kind: 'strength',
    description: 'Seduto con la schiena ben appoggiata, impugnature all’altezza del petto. Spingi in avanti senza bloccare i gomiti e torna lentamente.' },
  { key: 'croci-panca-piana', name: 'Croci su panca piana', muscleGroup: 'Pettorali', kind: 'strength',
    description: 'Supino su panca piana, manubri sopra il petto e gomiti leggermente flessi. Apri le braccia ad arco fino a sentire l’allungamento dei pettorali, poi richiudi.',
    notes: 'Carico riferito al singolo manubrio.' },
  { key: 'lat-machine-avanti', name: 'Lat Machine avanti', muscleGroup: 'Dorso', kind: 'strength',
    description: 'Presa larga, tira la barra verso la parte alta del petto portando le scapole in basso e indietro. Risali controllando il movimento.' },
  { key: 'pulley-basso', name: 'Pulley basso', muscleGroup: 'Dorso', kind: 'strength',
    description: 'Seduto con busto eretto e ginocchia leggermente flesse, tira l’impugnatura verso l’addome stringendo le scapole, senza oscillare con il busto.' },
  { key: 'alzate-laterali', name: 'Alzate laterali con manubri', muscleGroup: 'Spalle', kind: 'strength',
    description: 'In piedi, gomiti leggermente flessi: solleva i manubri lateralmente fino all’altezza delle spalle e scendi lentamente.',
    notes: 'Carico riferito al singolo manubrio.' },
  { key: 'lento-avanti-manubri', name: 'Lento avanti con manubri', muscleGroup: 'Spalle', kind: 'strength',
    description: 'Manubri all’altezza delle spalle, spingi sopra la testa senza inarcare la schiena e torna controllando.',
    notes: 'Carico riferito al singolo manubrio.' },
  { key: 'alzate-al-mento', name: 'Alzate al mento', muscleGroup: 'Spalle', kind: 'strength',
    description: 'Presa stretta, solleva il carico lungo il corpo fino al petto guidando il movimento con i gomiti alti.' },
  { key: 'crunch-a-terra', name: 'Crunch a terra', muscleGroup: 'Addome', kind: 'bodyweight',
    description: 'Supino con ginocchia piegate: solleva le spalle da terra contraendo l’addome, senza tirare il collo con le mani.' },
  { key: 'tapis-roulant', name: 'Tapis Roulant', muscleGroup: 'Cardio', kind: 'cardio',
    description: 'Camminata o corsa a ritmo costante.',
    cardioFields: ['durationSec', 'distanceKm', 'speedKmh', 'inclinePct', 'calories'] },
  { key: 'ellittica', name: 'Ellittica', muscleGroup: 'Cardio', kind: 'cardio',
    description: 'Movimento fluido e continuo a resistenza moderata.',
    cardioFields: ['durationSec', 'level', 'distanceKm', 'calories'] },
  { key: 'squat-corpo-libero', name: 'Squat a corpo libero', muscleGroup: 'Gambe/Glutei', kind: 'bodyweight',
    description: 'Piedi alla larghezza delle spalle: scendi portando indietro il bacino con schiena neutra e talloni a terra, risali spingendo sui talloni.' },
  { key: 'leg-press', name: 'Leg Press', muscleGroup: 'Gambe/Glutei', kind: 'strength',
    description: 'Piedi al centro della pedana alla larghezza delle spalle; scendi controllando fino a circa 90° e spingi senza bloccare le ginocchia.' },
  { key: 'leg-extension', name: 'Leg Extension', muscleGroup: 'Gambe/Glutei', kind: 'strength',
    description: 'Seduto con la schiena appoggiata, estendi le ginocchia fino quasi alla completa estensione e torna lentamente.' },
  { key: 'leg-curl-sdraiato', name: 'Leg Curl sdraiato', muscleGroup: 'Gambe/Glutei', kind: 'strength',
    description: 'Prono con il rullo sopra le caviglie: fletti le ginocchia portando i talloni verso i glutei senza sollevare il bacino.' },
  { key: 'curl-bilanciere', name: 'Curl con bilanciere', muscleGroup: 'Bicipiti', kind: 'strength',
    description: 'In piedi, gomiti vicini ai fianchi: fletti portando il bilanciere verso le spalle senza slanci del busto.' },
  { key: 'curl-manubri', name: 'Curl con manubri', muscleGroup: 'Bicipiti', kind: 'strength',
    description: 'Gomiti fermi ai fianchi, solleva i manubri ruotando il palmo verso l’alto; scendi controllando.',
    notes: 'Carico riferito al singolo manubrio.' },
  { key: 'push-down-cavi', name: 'Push down ai cavi', muscleGroup: 'Tricipiti', kind: 'strength',
    description: 'In piedi davanti al cavo alto, gomiti fermi ai fianchi: estendi le braccia verso il basso e risali lentamente.' },
];

interface Row {
  ex: string;
  sets: number;
  reps?: number;
  rest?: number;
  minutes?: number;
  notes?: string;
}

const TEMPLATE_A: Row[] = [
  { ex: 'chest-press', sets: 4, reps: 10, rest: 90 },
  { ex: 'croci-panca-piana', sets: 3, reps: 12, rest: 60 },
  { ex: 'lat-machine-avanti', sets: 4, reps: 10, rest: 90 },
  { ex: 'pulley-basso', sets: 3, reps: 12, rest: 90 },
  { ex: 'alzate-laterali', sets: 3, reps: 12, rest: 60 },
  { ex: 'lento-avanti-manubri', sets: 3, reps: 10, rest: 90 },
  { ex: 'alzate-al-mento', sets: 3, reps: 8, rest: 60 },
  { ex: 'crunch-a-terra', sets: 4, reps: 15, rest: 60 },
  { ex: 'tapis-roulant', sets: 1, minutes: 15 },
];

const TEMPLATE_B: Row[] = [
  { ex: 'ellittica', sets: 1, minutes: 5, notes: 'Riscaldamento' },
  { ex: 'squat-corpo-libero', sets: 3, reps: 12, rest: 60 },
  { ex: 'leg-press', sets: 3, reps: 12, rest: 90 },
  { ex: 'leg-extension', sets: 3, reps: 10, rest: 60 },
  { ex: 'leg-curl-sdraiato', sets: 3, reps: 10, rest: 60 },
  { ex: 'curl-bilanciere', sets: 3, reps: 12, rest: 60 },
  { ex: 'curl-manubri', sets: 3, reps: 10, rest: 60 },
  { ex: 'push-down-cavi', sets: 3, reps: 12, rest: 60 },
  { ex: 'ellittica', sets: 1, minutes: 10, notes: 'Defaticamento' },
];

export function buildSeed(today = todayISO()) {
  const exercises: Exercise[] = EXERCISES.map((e) => ({
    id: `seed-ex-${e.key}`,
    ...meta(),
    name: e.name,
    muscleGroup: e.muscleGroup,
    description: e.description,
    kind: e.kind,
    cardioFields: e.cardioFields ?? [],
    imageUrl: null,
    notes: e.notes ?? '',
    active: true,
    progression: null,
  }));

  const program: Program = {
    id: SEED_PROGRAM_ID,
    ...meta(),
    name: 'Scheda palestra',
    description: 'Programma iniziale con alternanza delle schede A e B.',
    status: 'active',
    schedule: { trainingDays: [1, 3, 5], startDate: startOfWeek(today), mode: 'keep_sequence' },
  };

  const templates: WorkoutTemplate[] = [
    { id: 'seed-tpl-A', ...meta(), programId: program.id, code: 'A', name: 'Allenamento A', position: 0,
      description: `Pettorali, dorso, spalle, addome e cardio. ${REST_NOTE}` },
    { id: 'seed-tpl-B', ...meta(), programId: program.id, code: 'B', name: 'Allenamento B', position: 1,
      description: `Riscaldamento, gambe/glutei, bicipiti, tricipiti e defaticamento. ${REST_NOTE}` },
  ];

  const toWorkoutExercises = (templateId: string, code: string, rows: Row[]): WorkoutExercise[] =>
    rows.map((r, i) => ({
      id: `seed-we-${code}-${i + 1}`,
      ...meta(),
      workoutTemplateId: templateId,
      exerciseId: `seed-ex-${r.ex}`,
      order: i,
      targetSets: r.sets,
      repsMin: r.reps ?? null,
      repsMax: r.reps ?? null,
      restSec: r.rest ?? null,
      targetDurationSec: r.minutes ? r.minutes * 60 : null,
      notes: r.notes ?? '',
    }));

  const workoutExercises = [
    ...toWorkoutExercises('seed-tpl-A', 'A', TEMPLATE_A),
    ...toWorkoutExercises('seed-tpl-B', 'B', TEMPLATE_B),
  ];

  return { exercises, program, templates, workoutExercises };
}

/** Inserisce i dati iniziali una sola volta (anche se l'utente in seguito li elimina). */
export async function ensureSeeded(database: AppDB, today = todayISO()): Promise<boolean> {
  return database.transaction('rw', [database.meta, database.programs, database.workoutTemplates, database.exercises, database.workoutExercises, database.settings], async () => {
    if (await database.meta.get('seeded')) return false;
    const seed = buildSeed(today);
    await database.exercises.bulkPut(seed.exercises);
    await database.programs.put(seed.program);
    await database.workoutTemplates.bulkPut(seed.templates);
    await database.workoutExercises.bulkPut(seed.workoutExercises);
    const settings = await database.settings.get('settings');
    if (!settings) {
      await database.settings.put({ ...defaultSettings(), activeProgramId: seed.program.id });
    }
    await database.meta.put({ key: 'seeded', value: Date.now() });
    return true;
  });
}
