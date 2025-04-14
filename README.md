# Tldraw Editor Technical Test

This is a simple collaborative editor built using Next.js, tldraw, tRPC, TailwindCSS, and Shadcn UI.

## Features

*   A real-time editor page powered by tldraw.
*   Automatic saving of the document state to the server on changes.
*   API endpoints (`getDocument`, `saveDocument`) using tRPC for data persistence (currently in-memory).
*   A button to demonstrate modifying shapes programmatically.

## Technologies Used

*   [Next.js](https://nextjs.org/) (App Router)
*   [React](https://reactjs.org/)
*   [tldraw](https://tldraw.dev/)
*   [tRPC](https://trpc.io/)
*   [TailwindCSS](https://tailwindcss.com/)
*   [Shadcn UI](https://ui.shadcn.com/)
*   [Zod](https://zod.dev/)

## Setup and Installation

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd <repository-directory>
    ```

2.  **Install dependencies:**
    Make sure you have Node.js (v18 or later recommended, although v16 might work with warnings) and npm installed.
    ```bash
    npm install
    ```
    *Note: If you encounter issues with peer dependencies during installation, you might need to use `npm install --legacy-peer-deps`.*

3.  **Environment Variables:**
    No specific environment variables are required for the basic setup, as it uses an in-memory store.

## Running the Application Locally

1.  **Start the development server:**
    ```bash
    npm run dev
    ```

2.  **Open your browser:**
    Navigate to [http://localhost:3000/editor](http://localhost:3000/editor) (or the port specified in your terminal).

## How to Use

*   Open the `/editor` page.
*   Use the tldraw tools to draw shapes, write text, etc.
*   Changes are automatically saved to the server's memory after a short delay (debounced). If you refresh the page, the last saved state should load.
*   Click the "Modify Shape" button. This will either:
    *   Change the color (or position if color isn't applicable) of the currently selected shape.
    *   Change the color/position of the first shape found if none are selected.
    *   Create a new shape if the canvas is empty.
    This action also triggers the save mechanism.

## API Testing (tRPC)

Since tRPC is used for type-safe API calls directly within the frontend code, traditional API testing tools like Postman or `curl` aren't the primary way to interact with the endpoints.

*   **Frontend Interaction:** The best way to "test" the API is by using the application itself. Observe the browser's developer console for logs indicating when data is being fetched (`API: Retrieving document...`) and saved (`API: Saving document...`, `Document saved successfully via API.`).
*   **Network Tab:** You can also inspect the Network tab in your browser's developer tools. Look for requests to `/api/trpc/document.getDocument` (on load) and `/api/trpc/document.saveDocument` (on changes or button click) to see the data being transferred.

*(Optional: If you were to build a dedicated testing setup, you might use tools like Vitest with tRPC client integration to call procedures directly in tests.)*
