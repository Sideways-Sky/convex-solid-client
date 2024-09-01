# Convex Solid Client

TypeScript client library for Convex in SolidJS.

`npm install convex-solid-client` <br />
`pnpm install convex-solid-client` <br />
`yarn add convex-solid-client` <br />
`bun add convex-solid-client` <br />

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
