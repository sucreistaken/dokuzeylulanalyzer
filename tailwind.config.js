/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {},
    },
    plugins: [],
    corePlugins: {
        // Ant Design kendi reset'ini uyguluyor, preflight ile catisiyor.
        preflight: false,
    },
}
