import type { Answer, Result, Sources, Storage } from './app.contract.d.ts';

const FILE = 'app:/data/tasks.json';
export const grants = `fs.read ${FILE}\nfs.write ${FILE}`;

type Task = Result<'loadTasks'>[number];
type TaskFile = { nextId: number; tasks: Task[] };
type OldTask = Omit<Task, 'priority' | 'category'> & { priority?: string; category?: string };

const NEXT_PRIORITY: Record<string, string> = { high: 'medium', medium: 'low', low: 'high' };

const load = (storage: Storage): Promise<TaskFile> => storage.fs.readFile(FILE).then(
  (bytes) => {
    const file = JSON.parse(new TextDecoder().decode(bytes)) as { nextId: number; tasks: OldTask[] };
    return {
      nextId: file.nextId,
      tasks: file.tasks.map((task) => ({
        ...task,
        priority: task.priority === 'high' || task.priority === 'low' ? task.priority : 'medium',
        category: task.category === 'work' || task.category === 'home' ? task.category : 'personal',
      })),
    };
  },
  (error) => {
    if (error.code === 'ENOENT') return { nextId: 1, tasks: [] };
    throw error;
  },
);

const save = async (storage: Storage, file: TaskFile): Promise<Result<'addTask'>> => {
  await storage.fs.atomicWriteFile(FILE, new TextEncoder().encode(JSON.stringify(file)));
  return { ok: true, error: '' };
};

const sources: Sources = {
  loadTasks: async (_args, _store, storage) => (await load(storage)).tasks,
  addTask: async ([input, priority, category], _store, storage) => {
    const title = input.trim();
    if (!title) return { ok: false, error: '' };
    const file = await load(storage);
    return save(storage, {
      nextId: file.nextId + 1,
      tasks: [...file.tasks, { id: String(file.nextId), title, done: false, priority, category }],
    });
  },
  toggleDone: async ([id], _store, storage) => {
    const file = await load(storage);
    return save(storage, { ...file, tasks: file.tasks.map((task) => task.id === id ? { ...task, done: !task.done } : task) });
  },
  removeTask: async ([id], _store, storage) => {
    const file = await load(storage);
    return save(storage, { ...file, tasks: file.tasks.filter((task) => task.id !== id) });
  },
  cyclePriority: async ([id], _store, storage) => {
    const file = await load(storage);
    return save(storage, { ...file, tasks: file.tasks.map((task) => task.id === id ? { ...task, priority: NEXT_PRIORITY[task.priority] ?? 'high' } : task) });
  },
  clearDone: async (_args, _store, storage) => {
    const file = await load(storage);
    return save(storage, { ...file, tasks: file.tasks.filter((task) => !task.done) });
  },
};

export const answer: Answer = (source, args, store, storage, native) =>
  sources[source](args, store, storage, native);
