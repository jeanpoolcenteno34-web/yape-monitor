# Imagen base multi-arquitectura (ARM64 compatible para Oracle Cloud)
FROM node:20-alpine

# Directorio de trabajo
WORKDIR /app

# Instalar dependencias primero (aprovechar cache de capas)
COPY package*.json ./
RUN npm install --production

# Copiar el resto del código
COPY . .

# Exponer el puerto
EXPOSE 3000

# Comando de inicio
CMD ["npm", "start"]
