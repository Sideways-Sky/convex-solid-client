# Convex Solid Client

TypeScript client library for Convex in SolidJS.

`npm install convex-solid-client`
`pnpm install convex-solid-client`
`yarn add convex-solid-client`
`bun add convex-solid-client`

### Setup

Create a `ConvexSolidClient` to connect to Convex

```typescript
import { ConvexSolidClient } from "convex-solid-client"

const convex = new ConvexSolidClient(import.meta.env.VITE_CONVEX_URL!)

render(
  () => {
    return (
      <ConvexContext.Provider value={convex}>
          <App />
      </ConvexContext.Provider>
    )
  },
  document.getElementById("root") as HTMLElement
)
```

## Usage

Basic Usage

```tsx
const sendMessage = createMutation(api.messages.create)
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

Uploading Files

```tsx
const generateUploadUrl = createMutation(api.files.generateUploadUrl)
const { startUpload, isUploading } = useUploadFile(generateUploadUrl, {
  onProgressChange: (progress) => {
    console.log(progress)
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
        const {
          response: { storageId },
          name,
          size,
          type,
        } = await startUpload(e.target.files[0])
      }}
    />
  </div>
)
```

Optimistic Updates

```tsx
const sendMessage = createMutation(
  api.messages.create,
  // -- Optimistic Update
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
