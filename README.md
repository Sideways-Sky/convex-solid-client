# Convex Solid Client

TypeScript client library for Convex in SolidJS.

`npm install convex-solid-client` <br />
`pnpm install convex-solid-client` <br />
`yarn add convex-solid-client` <br />
`bun add convex-solid-client` <br />

### Setup

Create a `ConvexSolidClient` to connect to Convex

```typescript
import { type Action, type Mutation, type OptionalFunctionArgs, ConvexSolidClient, baseAction, baseMutation, baseQuery } from "convex-solid-client"

export const ConvexContext = createContext<Accessor<ConvexSolidClient>>(() => new ConvexSolidClient(clientEnv.VITE_CONVEX_URL))

// create helper functions for creating mutations and queries

export function createQuery<Q extends FunctionReference<"query">>(query: Q, ...args: OptionalFunctionArgs<Q>): () => FunctionReturnType<Q> | undefined {
  const client = useContext(ConvexContext)
  return baseQuery(client(), query, ...args)
}

export function createMutation<M extends FunctionReference<"mutation">>(mutation: M, options?: { optimisticUpdate?: OptimisticUpdate<FunctionArgs<M>> }): Mutation<M> {
  const client = useContext(ConvexContext)
  return baseMutation(client(), mutation, options)
}

export function createAction<A extends FunctionReference<"action">>(action: A): Action<A> {
  const client = useContext(ConvexContext)
  return baseAction(client(), action)
}
```

## Usage

#### Basic Usage

```tsx
const sendMessage = createMutation(api.messages.create)
const messages = createQuery(api.messages.get)
// there's also createAction

const [newMessage, setNewMessage] = createSignal("")

return (
  <div class="flex flex-col gap-2">
    <input placeholder="Type a message" value={newMessage()} onInput={(e) => setNewMessage(e.currentTarget.value)} />
    <button onClick={() => sendMessage({ message: newMessage() })}>Send</button>
    <For each={messages()}>{(message) => <div>{message.message}</div>}</For>
  </div>
)
```

#### Authentication

This example uses the `createSession` from `@solid-mediakit/auth` to handle authentication.

```tsx
export function ConvexProvider(props: FlowProps) {
  const [convex, setConvex] = createSignal(new ConvexSolidClient(clientEnv.VITE_CONVEX_URL))
  const session = createSession()
  createEffect(() => {
    setConvex((prev) => {
      prev.setAuth(
        async () => {
          return session()?.convexToken || null
        },
        (isAuthenticated) => {
          console.log("Convex is Authenticated: ", isAuthenticated)
        }
      )
      return prev
    })
    return () => {
      setConvex((prev) => {
        prev.client.clearAuth()
        return prev
      })
    }
  })
  return <ConvexContext.Provider value={convex}>{props.children}</ConvexContext.Provider>
}
```

#### Uploading Files

There's also:

- `createUploadFile` for simpler usage when you only need to upload one file
- `uploadFiles` and `uploadFile` for more control over the upload process

```tsx
const generateUploadUrl = createMutation(api.files.generateUploadUrl)
const { startUpload, isUploading } = createUploadFiles(generateUploadUrl, {
  onProgressChange: (progress) => {
    console.log(progress)
  },
  onFullUpload(upload, files) {
    // called after all files have been uploaded
    // optionally: do something with the response...
  },
  onIndividualUpload(upload, file) {
    // called immediately after each individual file upload
    // optionally: do something with the response...
  },
})

return (
  <div>
    <input
      type="file"
      disabled={isUploading()}
      onChange={async (e) => {
        if (!e.target.files?.length) {
          return
        }
        const files = Array.from(e.target.files)
        const uploaded = await startUpload(files)
        // optionally: do something with the response... (equivalent to the onFullUpload callback)
      }}
    />
  </div>
)
```

#### Optimistic Updates

```tsx
const sendMessage = createMutation(
  api.messages.create,
  // -- Optimistic Update (2ed argument, optional)
  (localStore, arg) => {
    const messages = localStore.getQuery(api.messages.get)
    if (!messages) return
    const newMessage = {
      _id: crypto.randomUUID() as Id<"messages">,
      _creationTime: Date.now(),
      ...arg,
    }
    localStore.setQuery(api.messages.get, {}, [...messages, newMessage])
  }
  // --
)
const messages = createQuery(api.messages.get)

const [newMessage, setNewMessage] = createSignal("")

return (
  <div class="flex flex-col gap-2">
    <input placeholder="Type a message" value={newMessage()} onInput={(e) => setNewMessage(e.currentTarget.value)} />
    <button onClick={() => sendMessage({ message: newMessage() })}>Send</button>
    <For each={messages()}>{(message) => <div>{message.message}</div>}</For>
  </div>
)
```
