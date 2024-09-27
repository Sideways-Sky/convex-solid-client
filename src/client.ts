import { ConvexClient, ConvexClientOptions, OptimisticUpdate } from "convex/browser"
import { FunctionArgs, FunctionReference, FunctionReturnType, getFunctionName } from "convex/server"
import { from } from "solid-js"

export type EmptyObject = Record<string, never>
export type OptionalFunctionArgs<FuncRef extends FunctionReference<any>> = FunctionArgs<FuncRef> extends EmptyObject ? [args?: EmptyObject] : [args: FunctionArgs<FuncRef>]

export type Mutation<M extends FunctionReference<"mutation">> = (...args: OptionalFunctionArgs<M>) => Promise<FunctionReturnType<M>>

export type Action<A extends FunctionReference<"action">> = (...args: OptionalFunctionArgs<A>) => Promise<FunctionReturnType<A>>

export function baseQuery<Query extends FunctionReference<"query">>(client: ConvexSolidClient, query: Query, ...args: OptionalFunctionArgs<Query>): () => FunctionReturnType<Query> | undefined {
  const argsObj = args[0] ?? {}
  return from((setter) => {
    return client.onUpdate(query, argsObj, setter)
  })
}

export function baseMutation<M extends FunctionReference<"mutation">>(client: ConvexSolidClient, mutation: M, options?: { optimisticUpdate?: OptimisticUpdate<FunctionArgs<M>> }): Mutation<M> {
  return (...passedArgs) => {
    const args = passedArgs[0] ?? {}
    return client.mutation(mutation, args, options?.optimisticUpdate)
  }
}

export function baseAction<A extends FunctionReference<"action">>(client: ConvexSolidClient, action: A): Action<A> {
  return (...passedArgs) => {
    const args = passedArgs[0] ?? {}
    return client.action(action, args)
  }
}

export class ConvexSolidClient extends ConvexClient {
  constructor(address: string, options?: ConvexClientOptions) {
    super(address, options)
  }

  async mutation<Mutation extends FunctionReference<"mutation">>(mutation: Mutation, args: FunctionArgs<Mutation>, update?: OptimisticUpdate<FunctionArgs<Mutation>>): Promise<Awaited<FunctionReturnType<Mutation>>> {
    if (this.disabled) throw new Error("ConvexClient is disabled")
    return await this.client.mutation(getFunctionName(mutation), args, {
      optimisticUpdate: update,
    })
  }

  clearAuth() {
    this.client.clearAuth()
  }
}
