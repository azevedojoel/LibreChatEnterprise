/**
 * Tests for processLocalCodeOutput (local code execution output file processing).
 * Code runs locally - no CODE_API_KEY or HTTP/E2B download.
 */

const fileSizeLimitConfig = { value: 20 * 1024 * 1024 };

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    mergeFileConfig: jest.fn((config) => {
      const merged = actual.mergeFileConfig(config || {});
      return {
        ...merged,
        get serverFileSizeLimit() {
          return fileSizeLimitConfig.value;
        },
      };
    }),
    getEndpointFileConfig: jest.fn((options) => {
      const config = actual.getEndpointFileConfig(options);
      return {
        ...config,
        fileSizeLimit: fileSizeLimitConfig.value,
        supportedMimeTypes: config?.supportedMimeTypes ?? actual.fileConfig?.supportedMimeTypes ?? [],
      };
    }),
  };
});

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-file-id-123456789012'),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

const mockClaimCodeFile = jest.fn();
const mockCreateFile = jest.fn();
const mockConvertImage = jest.fn();
const mockSaveBuffer = jest.fn();
const mockDetermineFileType = jest.fn();

jest.mock('~/models', () => ({
  createFile: (...args) => mockCreateFile(...args),
  claimCodeFile: (...args) => mockClaimCodeFile(...args),
}));

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: jest.fn(),
}));

jest.mock('~/server/services/Files/images/convert', () => ({
  convertImage: (...args) => mockConvertImage(...args),
}));

jest.mock('~/server/utils', () => ({
  determineFileType: (...args) => mockDetermineFileType(...args),
}));

const { processLocalCodeOutput } = require('./processLocalOutput');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');

describe('processLocalCodeOutput', () => {
  const mockReq = {
    user: { id: 'user-123' },
    config: {
      fileConfig: {},
      fileStrategy: 'local',
      imageOutputType: 'webp',
    },
  };

  const baseParams = {
    req: mockReq,
    buffer: Buffer.from('test content'),
    name: 'test-file.txt',
    session_id: 'session-123',
    toolCallId: 'tool-call-123',
    conversationId: 'conv-123',
    messageId: 'msg-123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    fileSizeLimitConfig.value = 20 * 1024 * 1024;
    mockClaimCodeFile.mockResolvedValue({
      file_id: 'mock-file-id-123456789012',
      usage: 1,
      createdAt: new Date().toISOString(),
    });
    mockCreateFile.mockResolvedValue({});
    mockConvertImage.mockResolvedValue({
      filepath: '/uploads/mock-path.webp',
      file_id: 'mock-file-id-123456789012',
    });
    mockSaveBuffer.mockResolvedValue('/uploads/mock-path.txt');
    mockDetermineFileType.mockResolvedValue({ mime: 'text/plain' });
    getStrategyFunctions.mockReturnValue({
      saveBuffer: mockSaveBuffer,
    });
  });

  it('should return null when buffer exceeds file size limit', async () => {
    fileSizeLimitConfig.value = 5;
    const largeBuffer = Buffer.alloc(10, 'x');

    const result = await processLocalCodeOutput({
      ...baseParams,
      buffer: largeBuffer,
    });

    expect(result).toBeNull();
    expect(mockClaimCodeFile).not.toHaveBeenCalled();
    expect(mockCreateFile).not.toHaveBeenCalled();
  });

  it('should process non-image file and call saveBuffer', async () => {
    const result = await processLocalCodeOutput(baseParams);

    expect(result).not.toBeNull();
    expect(result.filename).toBe('test-file.txt');
    expect(result.messageId).toBe('msg-123');
    expect(result.toolCallId).toBe('tool-call-123');
    expect(result.context).toBe('execute_code');
    expect(mockSaveBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        buffer: baseParams.buffer,
        fileName: expect.stringMatching(/mock-file-id-123456789012__test-file\.txt/),
        basePath: 'uploads',
      }),
    );
    expect(mockConvertImage).not.toHaveBeenCalled();
  });

  it('should process image file and call convertImage', async () => {
    const imageParams = { ...baseParams, name: 'chart.png' };

    const result = await processLocalCodeOutput(imageParams);

    expect(result).not.toBeNull();
    expect(result.filename).toBe('chart.png');
    expect(mockConvertImage).toHaveBeenCalledWith(
      mockReq,
      imageParams.buffer,
      'high',
      expect.stringMatching(/mock-file-id-123456789012\.png/),
    );
    expect(mockSaveBuffer).not.toHaveBeenCalled();
  });

  it('should return null when saveBuffer is not available for non-image', async () => {
    getStrategyFunctions.mockReturnValue({ saveBuffer: null });

    const result = await processLocalCodeOutput(baseParams);

    expect(result).toBeNull();
    expect(mockCreateFile).not.toHaveBeenCalled();
  });
});
