import { GenericId } from "convex/values"
import { createSignal } from "solid-js"

type Awaitable<T> = T | PromiseLike<T>

export type fileDef = {
  name: string
  type: string
  size: number
}

export type UploadFileResponse = fileDef & {
  response: {
    storageId: GenericId<"_storage">
  }
}

export type progressTracking = {
  average: number
  individual: Map<string, number>
  both: { average: number; individual: Map<string, number> }
}

export function useUploadFiles<pt extends keyof progressTracking = "both", ptArgs = progressTracking[pt]>(
  uploadUrl: string | (() => Awaitable<string>),
  opts?: {
    progressTracking?: pt
    onProgressChange?: (p: ptArgs) => void
    onFullUpload?: (upload: Promise<UploadFileResponse[]>, files: fileDef[]) => Awaitable<void>
    onIndividualUpload?: (upload: Promise<UploadFileResponse>, file: fileDef) => Awaitable<void>
  }
) {
  const [isUploading, setUploading] = createSignal(false)
  let uploadProgress = 0
  let fileProgress: Map<string, number> = new Map()

  const startUpload = async (files: File[]) => {
    setUploading(true)

    const fullPromise = (async () => {
      const url = typeof uploadUrl === "string" ? uploadUrl : await uploadUrl()
      return await Promise.all(
        files.map(async (file: File) => {
          const individualPromise = uploadFile({
            file,
            url,
            onUploadProgress({ file, progress }) {
              if (opts?.onProgressChange == null) {
                return
              }
              if (opts.progressTracking === "individual") {
                opts.onProgressChange?.(fileProgress as ptArgs)
                return
              }
              fileProgress.set(file.name, progress)
              let sum = 0
              fileProgress.forEach((singleFileProgress) => {
                sum += singleFileProgress
              })
              const averageProgress = Math.floor(sum / fileProgress.size / 10) * 10
              if (averageProgress !== uploadProgress) {
                opts.onProgressChange?.((opts.progressTracking === "average" ? averageProgress : { average: averageProgress, individual: fileProgress }) as ptArgs)
                uploadProgress = averageProgress
              }
            },
          })
          opts?.onIndividualUpload?.(individualPromise, file)
          return individualPromise
        })
      )
    })()

    opts?.onFullUpload?.(fullPromise, files)

    try {
      return await fullPromise
    } finally {
      uploadProgress = 0
      fileProgress = new Map()
      setUploading(false)
    }
  }

  return {
    startUpload,
    isUploading,
  }
}

export function useUploadFile(
  uploadUrl: string | (() => Awaitable<string>),
  opts?: {
    onProgressChange?: (progress: number, file: fileDef) => void
    onUpload?: (upload: Promise<UploadFileResponse>, file: fileDef) => Awaitable<void>
  }
) {
  const [isUploading, setUploading] = createSignal(false)

  const startUpload = async (file: File) => {
    setUploading(true)

    const promise = (async () => {
      const url = typeof uploadUrl === "string" ? uploadUrl : await uploadUrl()
      return await uploadFile({
        file,
        url,
        onUploadProgress: ({ file, progress }) => {
          opts?.onProgressChange?.(progress, file)
        },
      })
    })()

    opts?.onUpload?.(promise, file)

    try {
      return await promise
    } finally {
      setUploading(false)
    }
  }

  return {
    startUpload,
    isUploading,
  }
}

function getMimeType(file: File) {
  if (file.type === "blob") {
    return "application/octet-stream"
  } else if (file.type === "pdf") {
    return "application/pdf"
  } else {
    return file.type
  }
}

export const uploadFiles = async (args: { url: string; files: File[]; onUploadProgress?: ({ file, progress }: { file: fileDef; progress: number }) => void }): Promise<UploadFileResponse[]> => {
  return Promise.all(
    args.files.map(async (file: File) =>
      uploadFile({
        ...args,
        file,
      })
    )
  )
}

export const uploadFile = async (args: { url: string; file: File; onUploadProgress?: ({ file, progress }: { file: fileDef; progress: number }) => void }): Promise<UploadFileResponse> => {
  const response = await fetchWithProgress(
    args.url,
    {
      method: "POST",
      body: args.file,
      headers: new Headers({
        "Content-Type": getMimeType(args.file),
      }),
    },
    (progressEvent) =>
      args.onUploadProgress?.({
        file: args.file,
        progress: (progressEvent.loaded / progressEvent.total) * 100,
      })
  )
  return {
    name: args.file.name,
    size: args.file.size,
    type: args.file.type,
    response,
  } as UploadFileResponse
}

function fetchWithProgress(
  url: string,
  opts: {
    headers?: Headers
    method?: string
    body?: File
  } = {},
  onProgress?: (this: XMLHttpRequest, progress: ProgressEvent) => void
) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.responseType = "json"
    xhr.open(opts.method ?? "get", url)
    opts.headers && Object.keys(opts.headers).forEach((h) => opts.headers && xhr.setRequestHeader(h, opts.headers.get(h) ?? ""))
    xhr.onload = () => {
      resolve(xhr.response)
    }

    xhr.onerror = reject
    if (xhr.upload && onProgress) xhr.upload.onprogress = onProgress
    xhr.send(opts.body)
  })
}
