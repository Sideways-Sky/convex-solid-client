import { ConvexClient, ConvexClientOptions, OptimisticUpdate } from "convex/browser"
import { FunctionArgs, FunctionReference, FunctionReturnType, getFunctionName } from "convex/server"
import { Context, createContext, from, useContext } from "solid-js"

export type EmptyObject = Record<string, never>
export type OptionalFunctionArgs<FuncRef extends FunctionReference<any>> = FunctionArgs<FuncRef> extends EmptyObject ? [args?: EmptyObject] : [args: FunctionArgs<FuncRef>]

export interface Mutation<M extends FunctionReference<"mutation">> {
  (...args: OptionalFunctionArgs<M>): Promise<FunctionReturnType<M>>
}
export interface Action<A extends FunctionReference<"action">> {
  (...args: OptionalFunctionArgs<A>): Promise<FunctionReturnType<A>>
}

export const ConvexContext: Context<ConvexSolidClient | undefined> = createContext()

const useConvex = () => {
  const convex = useContext(ConvexContext)
  if (!convex) {
    throw "No convex context"
  }
  return convex
}

/**
 * Load a reactive query within a Solid component.
 *
 * Creates Solid signal will be updated with the result of the query
 * whenever the query result changes.
 *
 * Throws an error if not used under {@link ConvexContext}.
 *
 * @param query - A {@link FunctionReference} for the public query to run. ie: `api.messages.get`
 * @param args - The arguments to the query function
 * @returns Solid signal that will be updated whenever the query result changes. if the query is not yet loaded, the signal will be `undefined`.
 * @public
 */
export function createQuery<Query extends FunctionReference<"query">>(query: Query, ...args: OptionalFunctionArgs<Query>): () => FunctionReturnType<Query> | undefined {
  const convex = useConvex()
  const argsObj = args[0] ?? {}
  return from((setter) => {
    return convex.onUpdate(query, argsObj, setter)
  })
}

/**
 * Construct a new {@link Mutation}.
 *
 * Mutation objects can be called like functions to request execution of the
 * corresponding Convex function.
 *
 * Throws an error if not used under {@link ConvexContext}.
 *
 * @param mutation - A {@link server.FunctionReference} for the public mutation to run. ie: `api.messages.create`
 * @param update - An optional {@link OptimisticUpdate} function to use for optimistic updates.
 * @returns The {@link Mutation} function.
 *
 * @public
 */
export function createMutation<M extends FunctionReference<"mutation">>(mutation: M, update?: OptimisticUpdate<FunctionArgs<M>>): Mutation<M> {
  const convex = useConvex()
  return (...passedArgs) => {
    const args = passedArgs[0] ?? {}
    return convex.mutation(mutation, args, update)
  }
}

/**
 * Construct a new {@link Action}.
 *
 * Action objects can be called like functions to request execution of the
 * corresponding Convex function.
 *
 * Throws an error if not used under {@link ConvexContext}.
 *
 * @param action - A {@link FunctionReference} for the public action to run. ie: `api.ai.generateResponse`
 * @returns The {@link Action} function.
 *
 * @public
 */
export function createAction<A extends FunctionReference<"action">>(action: A): Action<A> {
  const convex = useConvex()
  return (...passedArgs) => {
    const args = passedArgs[0] ?? {}
    return convex.action(action, args)
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
}
