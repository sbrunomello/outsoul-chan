
const API_KEY = process.env.GEMINI_API_KEY ?? "";

const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

async function listarModelos() {
  if (!API_KEY || API_KEY.includes("COLE_SUA")) {
    console.error("Configure GEMINI_API_KEY no ambiente.");
    return;
  }

  console.log("Consultando modelos do Gemini...\n");

  const modelos = [];
  let pageToken;

  try {
    do {
      const url = new URL(BASE_URL);
      url.searchParams.set("pageSize", "100");

      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const response = await fetch(url, {
        headers: {
          "x-goog-api-key": API_KEY.trim(),
        },
        signal: AbortSignal.timeout(30000),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Erro HTTP:", response.status);
        console.error(data.error?.message || data);
        return;
      }

      modelos.push(...(data.models || []));
      pageToken = data.nextPageToken;
    } while (pageToken);

    const disponiveis = modelos
      .filter((modelo) =>
        modelo.supportedGenerationMethods?.includes("generateContent")
      )
      .map((modelo) => ({
        ID: modelo.name.replace("models/", ""),
        Nome: modelo.displayName,
        Entrada: modelo.inputTokenLimit,
        Saida: modelo.outputTokenLimit,
      }));

    console.log(`Modelos encontrados: ${disponiveis.length}\n`);

    console.table(disponiveis);

    console.log(
      "\nObservação: a listagem não garante cota gratuita."
    );
  } catch (error) {
    console.error("Falha na consulta:", error.message);
  }
}

listarModelos();
