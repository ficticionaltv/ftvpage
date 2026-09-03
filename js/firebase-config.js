/* ============================================================
   FicticionalTV — Configuración de Firebase
   Este archivo conecta la app con Firestore, una base de datos en
   la nube. Con esto, los animes y capítulos que agregues desde el
   panel de administración quedan guardados en el proyecto de
   Firebase (no en el localStorage de cada navegador), así que se
   ven igual para cualquier persona, en cualquier dispositivo.

   Debe cargarse ANTES de js/store.js, y después de los <script>
   del SDK de Firebase (firebase-app-compat.js y
   firebase-firestore-compat.js).
   ============================================================ */

const firebaseConfig = {
  apiKey: "AIzaSyAfPCoZRS0jMqkmJwfA2I8r7yWDQO60Nd8",
  authDomain: "ftvp-819b5.firebaseapp.com",
  projectId: "ftvp-819b5",
  storageBucket: "ftvp-819b5.firebasestorage.app",
  messagingSenderId: "579111284582",
  appId: "1:579111284582:web:ada6bd61e18089677822a7",
  measurementId: "G-ZW7QQBEQBP"
};

firebase.initializeApp(firebaseConfig);

/* Instancia de Firestore usada por js/store.js */
const db = firebase.firestore();
