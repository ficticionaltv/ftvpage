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

/* Instancia de Firebase Authentication usada por js/admin.js para
   proteger el panel con correo/contraseña y Google. La protección
   real (quién puede ESCRIBIR en Firestore) la deben imponer las
   Reglas de seguridad de Firestore en la consola de Firebase, no
   este archivo — ver la nota al final de js/admin.js. */
const auth = firebase.auth();

/* Instancia de Firebase Storage usada por js/admin.js para subir el
   logo/isotipo de cada anime (imagen que reemplaza al título de texto).
   Requiere que Storage esté habilitado en la consola de Firebase y que
   sus Reglas permitan subir solo a usuarios autenticados (ver la nota
   junto a updateAnimeLogo/handleLogoUpload en js/admin.js). */
const storage = firebase.storage();
