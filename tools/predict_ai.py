import pandas as pd
import json
import os
from tensorflow.keras import Input, Model, optimizers
from tensorflow.keras.layers import Embedding, Concatenate, Dense, Dropout
from sklearn.preprocessing import LabelEncoder
import numpy as np

def prepare_data(users_bd, tracks_bd):
    users_data = {"user_id": [], "track_id": []}
    with open(users_bd, encoding="utf-8") as file:
        users = json.load(file)
        for user_id, data in users.items():
            for track in data.get('favorites', []):
                users_data["user_id"].append(user_id)
                users_data["track_id"].append(
                    os.path.join(*track.split("/"))
                )
    users_df = pd.DataFrame(users_data)

    tracks_data = []
    with open(tracks_bd, encoding="utf-8") as file:
        tracks = json.load(file)
        for track in tracks:
            temp = {}
            temp["track_id"] = os.path.join(*track['path'])
            temp['title'] = track['track']
            temp['artist'] = track['artist']
            temp['genre'] = track['genre']
            tracks_data.append(temp)
    tracks_df = pd.DataFrame(tracks_data)

    user_track_df = pd.merge(users_df, tracks_df, on="track_id")

    users = users.keys()
    result = pd.DataFrame(columns=["user_id", "track_id", "track_name", "artist", "genre", "rating"])

    for user in users:
        for track in tracks_data:
            rating = user_track_df[(user_track_df["user_id"] == user) & (user_track_df["track_id"] == track["track_id"])]["artist"].count()
            result = result.append({"user_id": user,
                                    "track_id": track["track_id"],
                                    "track_name": track["title"],
                                    "artist": track["artist"],
                                    "genre": track["genre"],
                                    "rating": rating
                                    }, ignore_index=True)
    return result

def encode_data(result):
    global users_mapping, tracks_mapping, all_tracks_unical, users_tracks, user_encoder, track_encoder, artist_encoder, genre_encoder
    user_encoder = LabelEncoder()
    track_encoder = LabelEncoder()
    artist_encoder = LabelEncoder()
    genre_encoder = LabelEncoder()

    result['user_id'] = user_encoder.fit_transform(result['user_id'])
    result['track_id'] = track_encoder.fit_transform(result['track_id'])
    result['artist'] = artist_encoder.fit_transform(result['artist'])
    result['genre'] = genre_encoder.fit_transform(result['genre'])

    users_mapping = dict(zip(user_encoder.classes_, user_encoder.transform(user_encoder.classes_)))
    tracks_mapping = dict(zip(track_encoder.classes_, track_encoder.transform(track_encoder.classes_)))
    all_tracks_unical = result[['track_id', 'artist', 'genre']].drop_duplicates()
    users_tracks = result


def make_model(result):
    num_users = len(result['user_id'].unique())
    num_tracks = len(result['track_id'].unique())
    num_artists = len(result['artist'].unique())
    num_genres = len(result['genre'].unique())

    embedding_size = 8

    # Создание слоя для user_ids
    user_id_input = Input(shape=(1,), name='user_id')
    user_id_embedding = Embedding(input_dim=num_users, output_dim=embedding_size, 
                                  input_length=1, name='user_id_embedding')(user_id_input)

    # Создание слоя для track_ids
    track_id_input = Input(shape=(1,), name='track_id')
    track_id_embedding = Embedding(input_dim=num_tracks, output_dim=embedding_size, 
                                   input_length=1, name='track_id_embedding')(track_id_input)

    # Создание слоя для artists
    artist_input = Input(shape=(1,), name='artist')
    artist_embedding = Embedding(input_dim=num_artists, output_dim=embedding_size, 
                                 input_length=1, name='artist_embedding')(artist_input)

    # Создание слоя для genres
    genre_input = Input(shape=(1,), name='genre')
    genre_embedding = Embedding(input_dim=num_genres, output_dim=embedding_size, 
                                input_length=1, name='genre_embedding')(genre_input)

    # Объединение слоев в один
    merged_layer = Concatenate()([user_id_embedding, track_id_embedding, artist_embedding, genre_embedding])

    # Добавление dropout-слоя для регуляризации
    dropout_rate = 0.5
    merged_layer = Dropout(rate=dropout_rate)(merged_layer)

    hidden_layer = Dense(units=32, activation='relu', name='hidden_layer')(merged_layer)

    # Добавление полносвязного слоя для классификации
    output_layer = Dense(units=1, activation='sigmoid', name='output_layer')(hidden_layer)

    # Создание модели
    model = Model(inputs=[user_id_input, track_id_input, artist_input, genre_input], outputs=output_layer)

    model.compile(optimizer=optimizers.Adagrad(0.5), loss='binary_crossentropy', metrics=['accuracy'])

    return model


def train_data(result):
    global model
    X = result[['user_id', 'track_id', 'artist', 'genre']]
    y = result['rating']
    X_train = X
    y_train = y

    train_x_arr = [
        X_train["user_id"].values,
        X_train["track_id"].values,
        X_train["artist"].values,
        X_train["genre"].values
    ]

    y_train = np.asarray(y_train.values).astype('float32').reshape((-1,1))
    model = make_model(result)
    history = model.fit(train_x_arr, y_train, epochs=10, batch_size=32)


def make_predict_for_user(user, limit=5):
    if not user in users_mapping.keys():
        return pd.DataFrame([])
    user_id = users_mapping[user]
    unliked_tracks = users_tracks.loc[(users_tracks['user_id'] == user_id) & (users_tracks['rating'] == 0)]
    if len(unliked_tracks) == 0:
        unliked_tracks = all_tracks_unical.assign(user_id=user_id)

    predict_arr = [
        unliked_tracks["user_id"].values,
        unliked_tracks["track_id"].values,
        unliked_tracks["artist"].values,
        unliked_tracks["genre"].values
    ]
    predictions = model.predict(predict_arr)
    predicted = unliked_tracks.assign(rating=predictions.flatten())

    predicted['track_id'] = track_encoder.inverse_transform(predicted['track_id'])
    return predicted.sort_values(by='rating', ascending=False)[['track_id', 'rating']].head(5)


def init(users_bd, tracks_bd):
    result = prepare_data(users_bd, tracks_bd)
    encode_data(result)
    train_data(result)
