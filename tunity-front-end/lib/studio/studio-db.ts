/** Browser-local studio storage (IndexedDB), scoped by signed-in user. */

type Store = "projects" | "pieces";
const NAME = "tunity-studio";

let opening: Promise<IDBDatabase> | undefined;
function open() {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("This browser cannot store studio data."));
    const request = indexedDB.open(NAME, 1);
    request.onupgradeneeded = () => {
      for (const store of ["projects", "pieces"]) {
        if (!request.result.objectStoreNames.contains(store))
          request.result.createObjectStore(store, { keyPath: "id" }).createIndex("uid", "uid");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { opening = undefined; reject(request.error); };
  });
  return opening;
}

function done<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listStudio<T>(store: Store, uid: string): Promise<T[]> {
  const db = await open();
  return done(db.transaction(store).objectStore(store).index("uid").getAll(uid)) as Promise<T[]>;
}

export async function putStudio<T extends { id: string; uid: string }>(store: Store, item: T) {
  const db = await open();
  await done(db.transaction(store, "readwrite").objectStore(store).put(item));
}

export async function deleteStudio(store: Store, id: string) {
  const db = await open();
  await done(db.transaction(store, "readwrite").objectStore(store).delete(id));
}
