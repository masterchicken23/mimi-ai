# Guia completo: como fazer a API de email funcionar

Siga os passos abaixo **na ordem**. Nada vai funcionar até o App Registration no Azure estar criado e o `.env` preenchido.

---

## 1. Ambiente Python

### 1.1 Verificar Python

Abra o **PowerShell** ou **Prompt de comando** e rode:

```powershell
python --version
```

ou, se tiver várias versões:

```powershell
py -3.11 --version
```

Você precisa de **Python 3.10 ou superior**. Se não tiver, instale em [python.org](https://www.python.org/downloads/) e marque a opção **“Add Python to PATH”**.

### 1.2 Criar e ativar o ambiente virtual

Na pasta do projeto (onde está a pasta `backend`):

```powershell
cd c:\Users\rodri\Desktop\hackathon\mimi-ai\backend
```

Criar o venv:

```powershell
python -m venv .venv
```

Se o comando for `py`:

```powershell
py -3.11 -m venv .venv
```

Ativar o venv (PowerShell):

```powershell
.\.venv\Scripts\Activate.ps1
```

Se der erro de política de execução, rode uma vez como Administrador:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

No **Cmd** (em vez de PowerShell):

```cmd
.venv\Scripts\activate.bat
```

Quando o venv estiver ativo, o prompt deve mostrar algo como `(.venv)` no início.

### 1.3 Instalar dependências

Ainda dentro de `backend`, com o venv ativo:

```powershell
pip install -r requirements.txt
```

Não deve aparecer erro. Se aparecer, confira se está realmente no venv (`where python` deve apontar para algo dentro de `backend\.venv`).

---

## 2. Registrar o app no Microsoft Azure (Entra ID)

A API usa **OAuth2 com permissões delegadas** (o app age **em nome do usuário**). Para isso você precisa de um **App Registration** no Azure.

### 2.1 Acessar o portal

1. Abra o navegador e vá em: **https://portal.azure.com**
2. Faça login com uma conta **Microsoft** (pode ser conta pessoal @outlook.com ou conta corporativa/school).

### 2.2 Entrar em App registrations

1. Na barra de busca no topo, digite: **Microsoft Entra ID** (ou **Azure Active Directory**).
2. Clique no resultado **Microsoft Entra ID**.
3. No menu da esquerda, em **Gerenciar**, clique em **App registrations**.
4. Clique no botão **+ New registration** (ou **Registrar um aplicativo**).

### 2.3 Preencher o registro

1. **Name**  
   - Ex.: `Mimi AI Email` (pode ser qualquer nome).

2. **Supported account types**  
   - Escolha uma das opções:
     - **Accounts in any organizational directory and personal Microsoft accounts**  
       - Permite contas da empresa/escola **e** contas pessoais (Outlook, Hotmail).  
       - Use esta se quiser testar com @outlook.com / @hotmail.com.
     - Ou **Personal Microsoft accounts only** se for só pessoal.

3. **Redirect URI**  
   - Em **Platform**, selecione **Web** (não Single-page application).
   - No campo **Redirect URI** coloque **exatamente**:
     ```text
     http://localhost:8000/auth/outlook/callback
     ```
   - Não use `https`, não use porta diferente, não adicione barra no final.

4. Clique em **Register** (Registrar).

### 2.4 Copiar o Application (client) ID

Na página do app que abrir:

1. Na seção **Essentials**, copie o valor de **Application (client) ID**.  
   - Ex.: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`
2. Guarde esse valor; será o `MS_CLIENT_ID` no `.env`.

Opcional: anote também o **Directory (tenant) ID** da mesma seção.  
- Se você quiser **apenas** contas do seu tenant (empresa), use esse ID em `MS_TENANT_ID`.  
- Para aceitar **qualquer** conta Microsoft (pessoal + trabalho), use `common` no `.env` (já é o padrão).

### 2.5 Criar o Client secret

1. No menu da esquerda do app, clique em **Certificates & secrets**.
2. Em **Client secrets**, clique em **+ New client secret**.
3. **Description**: ex. `Mimi backend local`.
4. **Expires**: escolha **6 months** ou **24 months** (lembre-se de renovar depois).
5. Clique em **Add**.
6. **Imediatamente** copie o **Value** do secret (não o Secret ID).  
   - Só aparece uma vez; se fechar a página, terá que criar outro secret.
7. Guarde esse valor em um lugar seguro; será o `MS_CLIENT_SECRET` no `.env`.

### 2.6 Configurar permissões da API (Microsoft Graph)

1. No menu da esquerda, clique em **API permissions**.
2. Clique em **+ Add a permission**.
3. Escolha **Microsoft Graph**.
4. Escolha **Delegated permissions** (não Application permissions).
5. Na busca ou na lista, marque:
   - **User.Read** (já costuma estar)
   - **Mail.ReadWrite** (ler e modificar emails)
   - **Mail.Send** (enviar emails)
6. Clique em **Add permissions**.

A lista deve mostrar algo como:

| API / Permission   | Type     | Status   |
|--------------------|----------|----------|
| Microsoft Graph    | Delegated| User.Read|
| Microsoft Graph    | Delegated| Mail.ReadWrite |
| Microsoft Graph    | Delegated| Mail.Send |

Para contas **pessoais** (@outlook.com), o consentimento costuma ser dado pelo próprio usuário ao fazer login. Para contas **organizacionais**, o admin do tenant pode precisar dar “Grant admin consent”; para desenvolvimento com sua conta, geralmente o consentimento normal do usuário basta.

Com isso, o App Registration está pronto.

---

## 3. Arquivo `.env` no backend

O backend lê as variáveis de ambiente de um arquivo `.env` na pasta `backend`.

### 3.1 Criar o arquivo

1. Vá na pasta do backend:
   ```powershell
   cd c:\Users\rodri\Desktop\hackathon\mimi-ai\backend
   ```
2. Copie o exemplo:
   ```powershell
   copy .env.example .env
   ```
3. Abra o arquivo `.env` no editor (Cursor, Notepad, etc.).

### 3.2 Preencher cada variável

Edite o `.env` e substitua os valores conforme abaixo.

| Variável           | O que colocar |
|--------------------|----------------|
| `DEBUG`            | Deixe `true` em desenvolvimento. |
| `SECRET_KEY`       | Uma string longa e aleatória (ex.: gere em [randomkeygen.com](https://randomkeygen.com/) ou use uma frase longa). Usado para assinar o cookie de sessão. |
| `FRONTEND_ORIGIN`  | URL do frontend. Para desenvolvimento: `http://localhost:5173` (sem barra no final). |
| `BACKEND_ORIGIN`   | URL do backend. Para desenvolvimento: `http://localhost:8000` (sem barra no final). |
| `MS_CLIENT_ID`     | O **Application (client) ID** que você copiou do Azure (passo 2.4). |
| `MS_CLIENT_SECRET` | O **Value** do client secret que você copiou (passo 2.5). |
| `MS_TENANT_ID`     | Use `common` para aceitar contas pessoais e de qualquer tenant. Ou o **Directory (tenant) ID** do Azure se quiser restringir ao seu tenant. |

Exemplo (com valores fictícios):

```env
DEBUG=true
SECRET_KEY=MinhaChaveSecretaMuitoLongaEComplexa123!
FRONTEND_ORIGIN=http://localhost:5173
BACKEND_ORIGIN=http://localhost:8000

MS_CLIENT_ID=a1b2c3d4-e5f6-7890-abcd-ef1234567890
MS_CLIENT_SECRET=abc~123.XYZ_SecretValueQueApareceuNoAzure
MS_TENANT_ID=common
```

Salve o arquivo. **Nunca** faça commit do `.env` (ele já está no `.gitignore`).

---

## 4. Subir o servidor da API

1. Abra o terminal na pasta do projeto.
2. Ative o venv (se ainda não estiver ativo):
   ```powershell
   cd c:\Users\rodri\Desktop\hackathon\mimi-ai\backend
   .\.venv\Scripts\Activate.ps1
   ```
3. Inicie o servidor:
   ```powershell
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
   - `--reload`: reinicia ao salvar código (útil em desenvolvimento).
   - `--host 0.0.0.0`: aceita conexões de outros dispositivos na rede (opcional; pode omitir e usar só `uvicorn app.main:app --reload`).

Você deve ver algo como:

```text
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete.
```

Deixe esse terminal aberto. A API estará em **http://localhost:8000**.

### Teste rápido (sem login)

Abra no navegador:

- **http://localhost:8000/health**

Deve retornar: `{"status":"ok"}`.

Documentação interativa:

- **http://localhost:8000/docs** (Swagger UI)

---

## 5. Fluxo de login (OAuth) e uso da API

As rotas de **email** exigem que o usuário tenha feito login (OAuth) pelo navegador. O backend guarda o token na sessão (cookie).

### 5.1 Fazer login (obter sessão)

1. Com o backend rodando, abra no **navegador** (mesmo computador):
   ```text
   http://localhost:8000/auth/outlook/login
   ```
2. Você será redirecionado para a página de login da Microsoft.
3. Entre com sua conta (Outlook, Microsoft 365, etc.) e, se aparecer, aceite as permissões (ler e enviar email).
4. Depois do consentimento, a Microsoft redireciona para:
   ```text
   http://localhost:8000/auth/outlook/callback?code=...&state=...
   ```
   O backend troca o `code` por tokens e redireciona você de volta para:
   ```text
   http://localhost:5173/dashboard?auth=success
   ```
   (ou a URL que estiver em `FRONTEND_ORIGIN` + `/dashboard?auth=success`).

5. A partir daí, o **navegador** tem um cookie de sessão. Todas as requisições para **http://localhost:8000** feitas **do mesmo navegador** e **com credentials** usarão essa sessão.

### 5.2 Verificar se está autenticado

No navegador, abra:

```text
http://localhost:8000/auth/outlook/status
```

Se estiver logado, a resposta será algo como:

```json
{
  "authenticated": true,
  "provider": "outlook",
  "user_id": "...",
  "display_name": "Seu Nome",
  "email": "seu@outlook.com"
}
```

Se não estiver: `{"authenticated": false}`. Nesse caso, faça de novo o passo 5.1.

### 5.3 Chamar a API de email (com sessão)

As chamadas precisam ser feitas **do mesmo domínio/origem** que recebeu o cookie, ou de um frontend que envie **credentials**. Resumo:

- **Pelo navegador (mesma origem ao backend)**  
  Ex.: abrir **http://localhost:8000/docs** e usar o Swagger a partir daí. O cookie de sessão é enviado automaticamente para localhost:8000.

- **De um frontend em http://localhost:5173**  
  O frontend deve usar `fetch` ou `axios` com `credentials: 'include'` em todas as requisições para `http://localhost:8000`, e o backend já está com CORS configurado para `FRONTEND_ORIGIN` com `allow_credentials=True`.

Exemplos de URLs para testar (no navegador, depois de logado):

- Listar mensagens da caixa de entrada:
  ```text
  http://localhost:8000/email/messages?folder=inbox&top=10
  ```
- Enviar email: use **POST** em **http://localhost:8000/email/send** (no Swagger em `/docs` é mais fácil).

No **Swagger** (http://localhost:8000/docs):

1. Faça primeiro o login pelo navegador em **http://localhost:8000/auth/outlook/login** (como no 5.1).
2. Depois abra **http://localhost:8000/docs**.
3. Os endpoints de `/email/*` vão usar o mesmo cookie; pode testar **GET /email/messages**, **POST /email/send**, etc., direto na interface.

### 5.4 Logout

**POST** para:

```text
http://localhost:8000/auth/outlook/logout
```

(No Swagger: endpoint **POST /auth/outlook/logout** → Execute.)

Isso limpa os tokens e a sessão. Para usar a API de email de novo, é preciso fazer login de novo (5.1).

---

## 6. Resumo do que você precisa ter feito

| # | O que fazer |
|---|-------------|
| 1 | Python 3.10+ instalado, venv criado e ativado, `pip install -r requirements.txt` |
| 2 | App Registration no Azure com redirect URI `http://localhost:8000/auth/outlook/callback`, client secret criado, permissões delegadas User.Read, Mail.ReadWrite, Mail.Send |
| 3 | Arquivo `backend/.env` com `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `SECRET_KEY`, `FRONTEND_ORIGIN`, `BACKEND_ORIGIN`, `MS_TENANT_ID` |
| 4 | Backend rodando: `uvicorn app.main:app --reload` dentro de `backend` com venv ativo |
| 5 | Login no navegador em `http://localhost:8000/auth/outlook/login`, depois usar `/email/*` ou o Swagger em `http://localhost:8000/docs` |

---

## 7. Erros comuns

- **Redirect URI mismatch**  
  O redirect URI no Azure tem que ser **exatamente** `http://localhost:8000/auth/outlook/callback` (incluindo porta e caminho).

- **401 ao chamar /email/messages**  
  Sessão não autenticada. Faça o login pelo navegador em `/auth/outlook/login` e use o mesmo navegador (ou envie o cookie) nas chamadas.

- **Backend não inicia / ModuleNotFoundError**  
  Confirme que está com o venv ativo e que instalou as dependências a partir de `backend`: `pip install -r requirements.txt`.

- **pydantic-settings / .env**  
  O `.env` deve estar em `backend/.env` (na mesma pasta onde está `app/`). O `config.py` carrega com `env_file=".env"` relativo ao diretório de trabalho; rode sempre o uvicorn a partir de `backend`.

Se algo falhar, confira: Python no PATH, venv ativo, `.env` preenchido, redirect URI no Azure idêntico ao que está no código e backend rodando na porta 8000.
