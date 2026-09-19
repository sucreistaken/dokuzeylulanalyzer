import { configureStore } from '@reduxjs/toolkit'
import courseReducer from './courseSlice'
import { persistMiddleware } from './middleware/persist'

/** Tek store tanimi. Kaynak uygulamada App.tsx ayrica store kuruyordu. */
export const store = configureStore({
    reducer: {
        course: courseReducer,
    },
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(persistMiddleware),
})

export type AppDispatch = typeof store.dispatch
