import { BlobServiceClient } from '@azure/storage-blob';

const connectionString = import.meta.env.VITE_REACT_APP_AZURE_STORAGE_CONNECTION_STRING;
const containerName = 'syllabus';

export class AzureStorageService {
  constructor() {
    this.blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    this.containerClient = this.blobServiceClient.getContainerClient(containerName);
  }

  async saveSyllabus(syllabus) {
    try {
      const blobName = `syllabus_${syllabus.courseName.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}.json`;
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      
      const data = JSON.stringify(syllabus);
      await blockBlobClient.upload(data, data.length);
      
      return blobName;
    } catch (error) {
      console.error('Erreur lors de la sauvegarde sur Azure:', error);
      throw error;
    }
  }
}