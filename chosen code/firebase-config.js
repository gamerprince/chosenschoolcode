// firebase-config.js (must be type=module in HTML)

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

export const firebaseConfig = {
    apiKey: "AIzaSyCeJDvo0F9xXmDFJNEbHc0vki9MLOwQx3w",
    authDomain: "chosencode-12520.firebaseapp.com",
    projectId: "chosencode-12520",
    storageBucket: "chosencode-12520.appspot.com",
    messagingSenderId: "164942674068",
    appId: "1:164942674068:web:8badb11ea027243beb9c81",
    measurementId: "G-065CEWYF9X"
};

// initialize firebase
export const app = initializeApp(firebaseConfig);

// Firestore
export const db = getFirestore(app);

// Authentication
export const auth = getAuth(app);
