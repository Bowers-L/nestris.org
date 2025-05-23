// npx ts-node digit-classifier.ts 

import { readFileSync } from 'fs';
import * as tf from '@tensorflow/tfjs-node';
import * as _ from 'lodash';

// Step 1: Load the JSON files from the directory
function loadData(jsonDirectory: string): Record<string, number[][][]> {
    const data: Record<string, number[][][]> = {};
    for (let i = 0; i < 10; i++) {
        const digit = i.toString();
        data[digit] = JSON.parse(readFileSync(`${jsonDirectory}/${digit}.json`, 'utf8'));
    }
    return data;
}

// Step 2: Balance the dataset
function balanceDataset(data: Record<string, number[][][]>): Record<string, number[][][]> {
    // Find the minimum length among all classes
    const minSamples = Math.min(...Object.values(data).map(arr => arr.length));

    // Resample each class to have the same number of samples
    const balancedData: Record<string, number[][][]> = {};
    for (const [digit, matrices] of Object.entries(data)) {
        balancedData[digit] = _.sampleSize(matrices, minSamples);
    }

    return balancedData;
}

// Step 3: Prepare the data for training and validation
async function prepareData(balancedData: Record<string, number[][][]>, testSize: number = 0.2): Promise<[tf.Tensor, tf.Tensor, tf.Tensor, tf.Tensor]> {
    const X: number[] = [];
    const y: number[] = [];

    // Gather all data and labels
    for (const [digit, matrices] of Object.entries(balancedData)) {
        matrices.forEach(matrix => {
            X.push(...matrix.flat()); // Flatten the matrix into a 1D array
            y.push(parseInt(digit));
        });
    }

    // Convert arrays to tensors
    const numSamples = y.length;
    const XTensor = tf.tensor4d(X, [numSamples, 14, 14, 1], 'float32'); // Shape: [samples, 14, 14, 1]
    const yTensor = tf.tensor1d(y, 'int32');

    // One-hot encode the labels
    const yOneHot = tf.oneHot(yTensor, 10);

    // Shuffle the data before splitting
    const shuffledIndices = Array.from(tf.util.createShuffledIndices(numSamples)); // Convert Uint32Array to a regular array
    const shuffledIndicesTensor = tf.tensor1d(shuffledIndices, 'int32');
    const XTensorShuffled = XTensor.gather(shuffledIndicesTensor);
    const yOneHotShuffled = yOneHot.gather(shuffledIndicesTensor);

    // Split into training and validation sets
    const splitIndex = Math.floor(numSamples * (1 - testSize));
    const [XTrain, XVal] = [XTensorShuffled.slice([0, 0, 0, 0], [splitIndex, -1, -1, -1]), XTensorShuffled.slice([splitIndex, 0, 0, 0], [-1, -1, -1, -1])];
    const [yTrain, yVal] = [yOneHotShuffled.slice([0, 0], [splitIndex, -1]), yOneHotShuffled.slice([splitIndex, 0], [-1, -1])];

    return [XTrain, XVal, yTrain, yVal];
}

// Step 4: Build and train the CNN model
async function buildAndTrainModel(XTrain: tf.Tensor, XVal: tf.Tensor, yTrain: tf.Tensor, yVal: tf.Tensor): Promise<[tf.LayersModel, tf.History]> {
    const model = tf.sequential();

    model.add(tf.layers.conv2d({
        inputShape: [14, 14, 1],
        filters: 32,
        kernelSize: 3,
        activation: 'relu'
    }));
    model.add(tf.layers.maxPooling2d({ poolSize: 2 }));
    model.add(tf.layers.conv2d({
        filters: 64,
        kernelSize: 3,
        activation: 'relu'
    }));
    model.add(tf.layers.maxPooling2d({ poolSize: 2 }));
    model.add(tf.layers.flatten());
    model.add(tf.layers.dense({ units: 128, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 10, activation: 'softmax' }));

    model.compile({
        optimizer: 'adam',
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy']
    });

    const history = await model.fit(XTrain, yTrain, {
        epochs: 10,
        batchSize: 32,
        validationData: [XVal, yVal]
    });

    return [model, history];
}

// Main function to load, balance, prepare, and train the model
async function main(jsonDirectory: string) {
    const data = loadData(jsonDirectory);

    const balancedData = balanceDataset(data);

    const [XTrain, XVal, yTrain, yVal] = await prepareData(balancedData);
    const [model, history] = await buildAndTrainModel(XTrain, XVal, yTrain, yVal);
    console.log('Training complete');
    return model;
}

// Example usage
const jsonDirectory = 'digit-dataset';
main(jsonDirectory).then((trainedModel) => {
    // Save the model
    trainedModel.save('file://digit_classifier_model');
}).catch((err) => {
    console.error('Error:', err);
});
